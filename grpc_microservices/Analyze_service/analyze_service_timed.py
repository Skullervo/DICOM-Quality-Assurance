# =============================================================================
# analyze_service_timed.py — Ultraääni-QA, TUOTANTOVERSIO (gRPC, portti 50052)
# =============================================================================
# ROOLI PUTKESSA:  Orthanc -> Fetch Service -> [tämä palvelu] -> MS SQL
#
# Tämä on pollaus-mallin kehittynein US-analyysipalvelu (vrt. yksinkertainen
# analyze_service.py). Lisäykset alkuperäiseen:
#   - MS SQL Server (pymssql) PostgreSQL:n sijaan
#   - Idempotenssi: jo analysoituja kuvia ei analysoida uudelleen
#   - Työnjako rinnakkaisille replikoille KAHDELLA tavalla:
#       * CLAIM / work-stealing (SHARD_TOTAL<=1): atominen varaus DB-taulussa +
#         reclaim/sweep kaatuneiden workerien orpojen töiden vapauttamiseksi
#       * index-sharding (SHARD_TOTAL>1): deterministinen hash-jako ilman DB-varausta
#   - Prometheus-metriikat (kuvamäärät, kesto, QA-tulokset) monitorointia varten
#   - Epäonnistumisten kirjaus analysis_failures-tauluun (syy + traceback)
#   - Ajastin, joka ajaa analyysikierroksen säännöllisin väliajoin
#
# HUOM: Käyttää raakaa SQL:ää (ei ORM:ää) — tiedossa oleva tekninen velka.
# Event-driven-mallissa tämä korvataan workerilla (worker_us_eventdriven.py),
# mutta ajetaan toistaiseksi rinnalla (strangler fig), kunnes cutover tehdään.
# =============================================================================

import sys
import os
# Lisää Fetch_service-hakemisto Python-polkuun, jotta sen generoidut gRPC-moduulit
# (fetch_service_pb2*) löytyvät importattaessa.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Fetch_service')))
# ...existing imports...

import json
import traceback
import grpc
import random
import re
import hashlib
from concurrent import futures
import analyze_service_timed_pb2
import analyze_service_timed_pb2_grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import pymssql
import numpy as np
import io
import pydicom
from pydicom.errors import InvalidDicomError
from US_IQ_analysis3 import imageQualityUS
import os
import requests
import threading
import time
import logging
from prometheus_client import Counter, Histogram, Gauge, start_http_server

# --- Prometheus-metriikat (käsikirjoituksen "continuous observability" -väitteet) ---
# Julkaistaan HTTP-portissa METRICS_PORT (oletus 9110). Prometheus skreippaa podit.
METRICS_PORT = int(os.getenv("METRICS_PORT", "9110"))

IMAGES_PROCESSED = Counter(
    "autoqad_images_processed_total",
    "Analysoitujen kuvien kokonaismäärä (status=success|failed).",
    ["modality", "status"],
)
ANALYSIS_DURATION = Histogram(
    "autoqad_analysis_duration_seconds",
    "Yksittäisen kuvan analyysin kesto sekunteina.",
    ["modality"],
    buckets=(0.25, 0.5, 1, 2, 4, 8, 16, 32, 64),
)
QA_RESULTS = Counter(
    "autoqad_qa_results_total",
    "Tietokantaan tallennettujen QA-tulosten kokonaismäärä.",
    ["modality"],
)
ANALYSIS_ROUNDS = Counter(
    "autoqad_analysis_rounds_total",
    "Suoritettujen analyysikierrosten kokonaismäärä.",
)
SHARD_INFO = Gauge(
    "autoqad_shard_total",
    "Tämän replikan työnjako: kuinka moneen shardiin työ on jaettu (1 = claim-tila).",
)

# 🔹 Orthanc ja Fetch Service osoitteet
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "admin")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "")
ORTHANC_AUTH = (ORTHANC_USERNAME, ORTHANC_PASSWORD) if ORTHANC_USERNAME else None
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "fetch-service:50051")

# MS SQL Server (pymssql). Skeema luodaan scripts/schema_mssql.sql:ssä.
DB_CONFIG = {
    "database": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
    "port": os.getenv("DATABASE_PORT", "1433"),
}

logger = logging.getLogger(__name__)

# Pod-/hostnimi (k8s asettaa HOSTNAME = pod-nimi). Käytetään työnjaon claimissa
# merkitsemään mikä replika varasi kuvan.
POD_NAME = os.getenv("HOSTNAME", "unknown")

# Kuinka vanha varaus (claim) saa olla ennen kuin toinen replika saa ottaa sen
# haltuunsa (reclaim). Suojaa orpoja varauksia vastaan: jos pod kuolee kesken
# analyysin, sen varaus vanhenee ja työ jatkuu toisella replikalla. Arvon pitää olla
# reilusti pidempi kuin yhden kuvan analyysiaika (~1 s), jottei elävän podin varausta
# varasteta. Sekunteina.
CLAIM_TIMEOUT_SECONDS = int(os.getenv("CLAIM_TIMEOUT_SECONDS", "120"))

# --- Työnjakotila (index-sharding vs. claim/work-stealing) ---
# SHARD_TOTAL = montako replikaa jakaa työn (StatefulSetin replikamäärä).
#   > 1 -> STAATTINEN SHARDING: kukin pod käsittelee vain oman osansa kuvista
#          (hash(instance_id) % SHARD_TOTAL == SHARD_INDEX). Ei claim-etsintäkulua,
#          synkronoitu puhdas skaalaus. SHARD_TOTAL:n PITÄÄ vastata ajossa olevien
#          replikoiden määrää, muuten osa shardeista jää käsittelemättä.
#   <= 1 -> CLAIM/WORK-STEALING (aiempi käyttäytyminen): kaikki pollaavat kaikki +
#           varaavat atomisesti; dynaaminen + vikasietoinen (reclaim/sweep).
# SHARD_INDEX = tämän podin numero. StatefulSetissä HOSTNAME = "<nimi>-N" -> N.
SHARD_TOTAL = int(os.getenv("SHARD_TOTAL", "1"))


def _detect_shard_index():
    """Lue podin ordinaali hostnamesta (StatefulSet: '...-N'). Voi myös yliajaa
    SHARD_INDEX-envillä (esim. Indexed Job). Oletus 0."""
    env_idx = os.getenv("SHARD_INDEX")
    if env_idx is not None and env_idx.strip() != "":
        try:
            return int(env_idx)
        except ValueError:
            pass
    m = re.search(r"-(\d+)$", POD_NAME)
    return int(m.group(1)) if m else 0


SHARD_INDEX = _detect_shard_index()


def _is_my_shard(instance_id):
    """Kuuluuko tämä instanssi tämän podin osuuteen? Sharding-tilassa (SHARD_TOTAL>1)
    deterministinen hash-jako; muuten kaikki (claim hoitaa työnjaon)."""
    if SHARD_TOTAL <= 1:
        return True
    h = int(hashlib.md5(instance_id.encode("utf-8")).hexdigest(), 16)
    return (h % SHARD_TOTAL) == SHARD_INDEX

# 🔹 Luo tietokantayhteys (taulu on jo olemassa, ks. schema_mssql.sql)
def connect_db():
    return pymssql.connect(**DB_CONFIG)


def _ensure_failures_table(cur):
    cur.execute("""
        IF OBJECT_ID('dbo.analysis_failures','U') IS NULL
        CREATE TABLE dbo.analysis_failures (
            modality NVARCHAR(8) NOT NULL,
            orthanc_id NVARCHAR(128) NOT NULL,
            station_name NVARCHAR(256) NULL,
            reason NVARCHAR(1000) NULL,
            detail NVARCHAR(MAX) NULL,
            failed_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            CONSTRAINT pk_analysis_failures PRIMARY KEY (modality, orthanc_id)
        )
    """)
    cur.execute("""
        IF COL_LENGTH('dbo.analysis_failures','detail') IS NULL
            ALTER TABLE dbo.analysis_failures ADD detail NVARCHAR(MAX) NULL
    """)


def _ensure_ultrasound_columns(cur):
    """Varmista per-kuva keston sarake (idempotentti). Sekunteina."""
    cur.execute("""
        IF COL_LENGTH('dbo.ultrasound','processing_time') IS NULL
            ALTER TABLE dbo.ultrasound ADD processing_time FLOAT NULL
    """)


def _ensure_claims_table(cur):
    """Työnjako-taulu (idempotentti). Kun useampi analyysireplika ajaa rinnakkain,
    kukin varaa (claim) instanssin atomisesti ennen analyysia. instance_id on
    PRIMARY KEY, joten vain yksi replika saa varauksen -> kukin kuva analysoidaan
    tasan kerran ilman päällekkäistä työtä (mahdollistaa horisontaalisen skaalauksen)."""
    try:
        cur.execute("""
            IF OBJECT_ID('dbo.analysis_claims','U') IS NULL
            CREATE TABLE dbo.analysis_claims (
                instance_id NVARCHAR(128) NOT NULL,
                claimed_by NVARCHAR(128) NULL,
                claimed_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                CONSTRAINT pk_analysis_claims PRIMARY KEY (instance_id)
            )
        """)
    except Exception as e:  # noqa: BLE001
        # IF OBJECT_ID IS NULL + CREATE ei ole atominen: kaksi replikaa voi molemmat
        # nähdä taulun puuttuvan ja yrittää luoda sen -> toinen saa virheen 2714
        # ("already an object"). Vaaraton kilpailu -> jatka. Muut virheet -> nosta.
        if "2714" not in str(e) and "already an object" not in str(e).lower():
            raise


def claim_instance(cur, conn, instance_id):
    """Yritä varata instanssi atomisesti. Palauttaa True jos tämä replika sai
    varauksen (saa analysoida), False jos toinen replika ehti ensin.

    PRIMARY KEY -törmäys = varaus on jo olemassa. Silloin yritetään RECLAIM:
    jos varaus on vanhentunut (pod kuoli, claimed_at vanhempi kuin timeout) EIKÄ
    kuvaa ole vielä analysoitu, tämä replika ottaa varauksen haltuunsa atomisella
    UPDATElla ja analysoi. Näin orvot varaukset eivät jää jumiin -> kaikki kuvat
    analysoidaan lopulta, myös kaatumisen jälkeen.

    Muu virhe (esim. transientti DB) -> rollback ja False; itsekorjaava, ei kaadu."""
    # 1) Yritä tuore varaus
    try:
        cur.execute(
            "INSERT INTO analysis_claims (instance_id, claimed_by) VALUES (%s, %s)",
            (instance_id, POD_NAME))
        conn.commit()
        return True
    except Exception:  # noqa: BLE001  (todennäköisesti PRIMARY KEY -törmäys)
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass

    # 2) Varaus on jo olemassa -> ota haltuun jos VANHENTUNUT eikä vielä analysoitu.
    #    Atominen UPDATE: onnistuu tasan yhdelle replikalle (ehdot WHERE:ssä).
    try:
        cur.execute(
            """
            UPDATE analysis_claims
            SET claimed_by = %s, claimed_at = SYSDATETIME()
            WHERE instance_id = %s
              AND claimed_at < DATEADD(second, -%s, SYSDATETIME())
              AND NOT EXISTS (SELECT 1 FROM ultrasound WHERE instance = %s)
            """,
            (POD_NAME, instance_id, CLAIM_TIMEOUT_SECONDS, instance_id))
        stolen = cur.rowcount
        conn.commit()
        if stolen and stolen > 0:
            logger.info("♻️ reclaim vanhentunut varaus %s", instance_id)
            return True
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        logger.info("reclaim skip %s: %s", instance_id, str(e)[:120])
    return False


def sweep_stale_claims(cur, conn):
    """Vapauta orvot varaukset KERRALLA kierroksen alussa (nopea reclaim): poista
    varaukset jotka ovat vanhentuneet (CLAIM_TIMEOUT_SECONDS) EIKÄ kuvaa ole
    analysoitu. Näin kaatuneen podin kesken jättämät kuvat tulevat heti uudelleen
    varattaviksi ja käsitellään SAMALLA kierroksella — ei tarvitse odottaa että
    per-instanssi-reclaim osuu niihin useamman skannauskierroksen aikana.
    Turvallinen: elävän podin varaus (~1 s) ei koskaan ole vanhempi kuin timeout."""
    try:
        cur.execute(
            """
            DELETE FROM analysis_claims
            WHERE claimed_at < DATEADD(second, -%s, SYSDATETIME())
              AND NOT EXISTS (SELECT 1 FROM ultrasound WHERE instance = analysis_claims.instance_id)
            """,
            (CLAIM_TIMEOUT_SECONDS,))
        freed = cur.rowcount
        conn.commit()
        if freed and freed > 0:
            logger.info("♻️ sweep: vapautettu %s orpoa varausta", freed)
        return freed or 0
    except Exception as e:  # noqa: BLE001
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        logger.info("sweep skip: %s", str(e)[:120])
        return 0


def record_failure(cur, orthanc_id, station, reason, detail=""):
    """Tallenna epäonnistuneen analyysin syy + traceback (upsert). orthanc_id = US:llä instanssi-id."""
    try:
        _ensure_failures_table(cur)
        cur.execute("DELETE FROM analysis_failures WHERE modality=%s AND orthanc_id=%s", ("US", orthanc_id))
        cur.execute(
            "INSERT INTO analysis_failures (modality, orthanc_id, station_name, reason, detail) VALUES (%s, %s, %s, %s, %s)",
            ("US", orthanc_id, (station or "")[:256], (reason or "")[:1000], (detail or "")[:8000]))
    except Exception as e:  # noqa: BLE001
        logger.error("record_failure error: %s", e)


def clear_failure(cur, orthanc_id):
    try:
        cur.execute("DELETE FROM analysis_failures WHERE modality=%s AND orthanc_id=%s", ("US", orthanc_id))
    except Exception as e:  # noqa: BLE001
        logger.error("clear_failure error: %s", e)

# 🔹 Tarkista onko instanssi jo analysoitu
# Idempotenssi: jos instanssi on jo ultrasound-taulussa, sitä ei analysoida
# uudelleen (kierros voidaan ajaa turvallisesti monta kertaa).
def is_instance_analyzed(cur, instance_id):
    cur.execute("SELECT 1 FROM ultrasound WHERE instance = %s", (instance_id,))
    return cur.fetchone() is not None

# 🔹 Yhdistetään Fetch Serviceen
# gRPC-stub (asiakaspää) DICOM-tavujen hakuun, iso viestikoko (200 MB).
def get_fetch_stub():
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)

# gRPC-käsittelijäluokka (analyze_service_timed.proto -rajapinta).
class AnalyzeService(analyze_service_timed_pb2_grpc.AnalyzeServiceServicer):
    # Yksi analyysikierros: käy läpi kaikki Orthancin sarjat/instanssit, suodattaa
    # US-kuvat, varaa työn (claim tai sharding), analysoi ja tallentaa tulokset.
    def AnalyzeAllDicomData(self, request, context):
        ANALYSIS_ROUNDS.inc()   # metriikka: kierrosten kokonaismäärä
        if SHARD_TOTAL > 1:
            logger.info("📡 Analyysikierros — SHARDING: pod %s = shard %s/%s (käsittelee ~1/%s kuvista)",
                        POD_NAME, SHARD_INDEX, SHARD_TOTAL, SHARD_TOTAL)
        else:
            logger.info("📡 Analyysikierros — CLAIM/work-stealing (SHARD_TOTAL=1)")

        # 🔍 Haetaan kaikki sarjat Orthancista
        response = requests.get(f"{ORTHANC_URL}/series", auth=ORTHANC_AUTH)
        if response.status_code != 200:
            logger.error("❌ Error: Could not fetch series from Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_timed_pb2.AnalyzeResponse(message="No series found", series_id="ALL")

        series_list = response.json()
        if not series_list:
            logger.warning("❌ No series found in Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_timed_pb2.AnalyzeResponse(message="No series available", series_id="ALL")

        # Satunnaista sarjojen käsittelyjärjestys per replika/kierros. Ilman tätä
        # rinnakkaiset replikat marssivat samassa järjestyksessä lukkoaskelin, jolloin
        # ensin ehtinyt replika varaa lähes kaiken (havaittu jako 754/48). Eri
        # järjestys -> claimit jakautuvat tasaisesti -> aito horisontaalinen skaalaus.
        random.shuffle(series_list)

        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()
        _ensure_ultrasound_columns(cur)  # per-kuva keston sarake (idempotentti)
        _ensure_claims_table(cur)        # työnjako-taulu (idempotentti)
        sweep_stale_claims(cur, conn)    # vapauta orvot varaukset kerralla (nopea reclaim)

        for series_id in series_list:
            logger.info("📡 Processing series ID: %s", series_id)

            # 🔍 Haetaan sarjan instanssit Orthancista
            instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances", auth=ORTHANC_AUTH)
            if instance_response.status_code != 200:
                logger.error("❌ Could not fetch instances for series %s", series_id)
                continue  # Ohitetaan tämä sarja

            instance_list = instance_response.json()
            if not instance_list:
                logger.warning("❌ No instances found for series %s", series_id)
                continue  # Ohitetaan tämä sarja

            for instance in instance_list:
                instance_id = instance["ID"]

                # 🔀 Sharding: käsittele vain tämän podin oma osuus (halpa hash-tarkistus,
                #    EI DB-kyselyä). SHARD_TOTAL>1 -> staattinen jako; muuten kaikki
                #    (claim jakaa työn). Tämä poistaa claim-etsintäkulun sharding-tilassa.
                if not _is_my_shard(instance_id):
                    continue

                # Tarkista onko jo analysoitu (idempotenssi uudelleenajossa)
                if is_instance_analyzed(cur, instance_id):
                    logger.info("⏩ Instance %s already analyzed, skipping.", instance_id)
                    continue

                # 🔀 Claim/work-stealing -tila (SHARD_TOTAL<=1): varaa instanssi atomisesti.
                #    Sharding-tilassa (SHARD_TOTAL>1) tätä EI tehdä — jako on jo hoidettu
                #    hashilla, joten vältetään turha varaus-/etsintäkulu.
                if SHARD_TOTAL <= 1:
                    if not claim_instance(cur, conn, instance_id):
                        continue

                logger.info("📡 Fetching instance ID: %s", instance_id)

                # 🔍 Haetaan DICOM-data Fetch-palvelulta
                fetch_response = fetch_stub.FetchDicomData(fetch_service_pb2.FetchRequest(instance_id=instance_id))

                if not fetch_response.dicom_data:
                    logger.warning("❌ No data received for instance %s", instance_id)
                    continue  # Ohitetaan tämä instanssi

                # 🔄 Muutetaan binääridata DICOM-muotoon
                dicom_bytes = io.BytesIO(fetch_response.dicom_data)
                try:
                    dicom_dataset = pydicom.dcmread(dicom_bytes, force=True)
                    logger.info("✅ DICOM data successfully read!")
                except InvalidDicomError as e:
                    logger.error("❌ Error reading DICOM file: %s", e)
                    continue  # Ohitetaan tämä instanssi

                # 🔍 Haetaan metadata
                metadata = {
                    "InstitutionName": dicom_dataset.get("InstitutionName", "Unknown"),
                    "InstitutionalDepartmentName": dicom_dataset.get("InstitutionalDepartmentName", "Unknown"),
                    "Manufacturer": dicom_dataset.get("Manufacturer", "Unknown"),
                    "ManufacturerModelName": dicom_dataset.get("ManufacturerModelName", ""),
                    "Modality": dicom_dataset.get("Modality", "Unknown"),
                    "StationName": dicom_dataset.get("StationName", "Unknown"),
                    "SeriesDate": dicom_dataset.get("SeriesDate", "Unknown"),
                    "StudyDate": dicom_dataset.get("StudyDate", ""),
                    "ContentDate": dicom_dataset.get("ContentDate", ""),
                    "DeviceSerialNumber": dicom_dataset.get("DeviceSerialNumber", ""),
                    "ContentTime": dicom_dataset.get("ContentTime", ""),
                }

                if metadata["Modality"] != "US":
                    logger.info("❌ Not an ultrasound image. Skipping instance %s", instance_id)
                    continue  # Ohitetaan tämä instanssi

                # 📊 Analysoidaan kuva (mitataan per-kuva kesto sekunteina)
                image_array = dicom_dataset.pixel_array
                start_time = time.time()
                analysis = imageQualityUS(dicom_dataset, dicom_bytes, image_array, "probe-LUT.xls")

                try:
                    result = analysis.MAIN_US_analysis()
                except Exception as e:
                    # Analyysi kaatui -> kirjaa epäonnistuminen (syy + traceback)
                    # analysis_failures-tauluun ja jatka seuraavaan kuvaan.
                    # Tällöin kuva EI päädy ultrasound-tauluun (ei tulosriviä).
                    logger.error("❌ Analysis failed for instance %s: %s", instance_id, e)
                    IMAGES_PROCESSED.labels(modality="US", status="failed").inc()
                    record_failure(cur, instance_id, str(metadata.get("StationName", "")), str(e), traceback.format_exc())
                    conn.commit()
                    continue
                processing_time = time.time() - start_time
                ANALYSIS_DURATION.labels(modality="US").observe(processing_time)

                # 🔹 Muunnetaan tulokset JSON-muotoon
                json_result = {
                    key: float(value) if isinstance(value, np.float64)
                    else value.tolist() if isinstance(value, np.ndarray)
                    else value for key, value in result.items()
                }

                # HUOM: u_cov/u_skew ovat QA-tuloksia (laitteen tasaisuus), EIVÄT
                # analyysin onnistumisen mittareita. Jos MAIN_US_analysis tuotti
                # metriikat, suoristus onnistui -> tulos tallennetaan aina.
                # Suoristuksen epäonnistuminen jäljitetään sen omassa kohdassa
                # (transform_convex/​sector_image2linear nostaa poikkeuksen), joka
                # päätyy yllä olevaan except-haaraan tracebackin kanssa.

                # 📂 Tallennetaan analyysitulokset tietokantaan
                transducer_name = json_result.get('transducer_name', '')
                horiz_prof = json.dumps(json_result.get('horiz_profile', []))
                vert_prof = json.dumps(json_result.get('vert_profiles', []))
                cur.execute("""
                    INSERT INTO ultrasound (
                        institutionname, institutionaldepartmentname, manufacturer, modality,
                        stationname, seriesdate, instance, serie, S_depth, U_cov, U_skew, U_low,
                        horiz_prof, vert_prof, tranducertype,
                        manufacturermodelname, studydate, contentdate, deviceserialnumber, contenttime,
                        processing_time
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    metadata["InstitutionName"],
                    metadata["InstitutionalDepartmentName"],
                    metadata["Manufacturer"],
                    metadata["Modality"],
                    metadata["StationName"],
                    metadata["SeriesDate"],
                    instance_id,
                    series_id,
                    float(json_result['S_depth']),
                    float(json_result['U_cov']),
                    float(json_result['U_skew']),
                    json.dumps([float(val) for val in json_result['U_low']]),
                    horiz_prof,
                    vert_prof,
                    transducer_name,
                    metadata["ManufacturerModelName"],
                    metadata["StudyDate"],
                    metadata["ContentDate"],
                    metadata["DeviceSerialNumber"],
                    metadata["ContentTime"],
                    float(processing_time),
                ))
                clear_failure(cur, instance_id)  # onnistui -> poista mahdollinen epäonnistumismerkintä
                IMAGES_PROCESSED.labels(modality="US", status="success").inc()
                QA_RESULTS.labels(modality="US").inc()

        conn.commit()
        cur.close()
        conn.close()

        return analyze_service_timed_pb2.AnalyzeResponse(message="Analysis complete for all new series!", series_id="ALL")

def serve():
    # Prometheus-metriikat: julkaistaan HTTP-portissa METRICS_PORT. Prometheus skreippaa
    # tämän podin (kubernetes_sd role: pod, portti 9110).
    SHARD_INFO.set(SHARD_TOTAL)
    start_http_server(METRICS_PORT)
    logger.info("📈 Prometheus-metriikat portissa %s (/metrics)", METRICS_PORT)

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    analyze_service_timed_pb2_grpc.add_AnalyzeServiceServicer_to_server(AnalyzeService(), server)
    server.add_insecure_port("[::]:50052")
    server.start()
    logger.info("🚀 Analyze Service running on port 50052")
    server.wait_for_termination()

# Käynnistä taustasäie, joka ajaa analyysikierroksen säännöllisin väliajoin
# (oletus 1 h). Näin uudet Orthanciin saapuneet kuvat analysoidaan automaattisesti
# ilman erillistä laukaisua.
def start_analyze_scheduler(interval_seconds=3600):
    def loop():
        while True:
            logger.info("⏰ Ajastettu analyysi käynnistyy")
            try:
                service = AnalyzeService()
                class DummyContext:
                    def set_code(self, code): pass
                service.AnalyzeAllDicomData(None, DummyContext())
            except Exception as e:  # noqa: BLE001
                # Yksittäinen kierrosvirhe (transientti DB-virhe, kilpailu ym.) EI saa
                # tappaa analyysisäiettä pysyvästi -> logita ja jatka seuraavaan kierrokseen.
                logger.error("Analyysikierros epäonnistui, jatketaan seuraavalla kierroksella: %s", e)
            logger.info("🕒 Odotetaan %s sekuntia seuraavaan ajoon...", interval_seconds)
            time.sleep(interval_seconds)
    t = threading.Thread(target=loop, daemon=True)
    t.start()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    start_analyze_scheduler(60)  # Ajastettu analyysi (esim. kerran minuutissa)
    serve()                        # Käynnistää gRPC-palvelimen