# =============================================================================
# analyze_service.py — Ultraääni-QA-analyysipalvelu (gRPC, portti 50052)
# =============================================================================
# ROOLI PUTKESSA:  Orthanc -> Fetch Service -> [Analyze Service] -> tietokanta
#
# Tämä on ALKUPERÄINEN/yksinkertaisin versio US-analyysipalvelusta. Se:
#   1. hakee KAIKKI sarjat Orthancista,
#   2. pyytää jokaisen instanssin DICOM-tavut Fetch Servicelta (gRPC),
#   3. suodattaa vain ultraäänikuvat (Modality == "US"),
#   4. ajaa kuva-analyysin (US_IQ_analysis3.imageQualityUS),
#   5. tallentaa tulokset tietokantaan.
#
# HUOM: Tämä varhainen versio käyttää PostgreSQL:ää (psycopg2) eikä sisällä
# idempotenssia (ei tarkista onko kuva jo analysoitu). Uudempi tuotantoversio on
# analyze_service_timed.py (MS SQL + claim-työnjako + metriikat) ja event-driven
# worker on worker_us_eventdriven.py. Tämä tiedosto on jätetty vertailukohdaksi.
# =============================================================================

import grpc
from concurrent import futures
import analyze_service_pb2
import analyze_service_pb2_grpc
import fetch_service_pb2           # Fetch Servicen gRPC-sanomatyypit (asiakaspää)
import fetch_service_pb2_grpc
import psycopg2                    # PostgreSQL-ajuri (vanha versio; uusi käyttää pymssql)
import numpy as np
import io
import pydicom                     # DICOM-tiedostojen luku
from pydicom.errors import InvalidDicomError
from US_IQ_analysis3 import imageQualityUS   # varsinainen kuva-analyysi
import os
import requests                    # Orthancin REST-rajapinnan kutsut
import logging

# 🔹 Orthanc ja Fetch Service osoitteet
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042") #virtuaaliympäristössä
#ORTHANC_URL = os.getenv("ORTHANC_URL", "http://host.docker.internal:8042") #kontissa

#FETCH_SERVICE_ADDRESS = "localhost:50051"
# 🔹 Fetch Service osoite (ennen localhost, nyt käytetään kontin nimeä)
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "fetch-service:50051") 
#FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "host.docker.internal:50051") 


# Tietokannan yhteysasetukset ympäristömuuttujista (oletukset kontti-/dev-verkkoon).
DB_CONFIG = {
    "dbname": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "postgres"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "host": os.getenv("DATABASE_HOST", "postgres-db-distributedQA"),
    "port": os.getenv("DATABASE_PORT", "5432"),
}

logger = logging.getLogger(__name__)


# 🔹 Luo tietokantayhteys ja varmista, että taulu on olemassa
# Avaa PostgreSQL-yhteyden ja luo ultrasound-taulu jos sitä ei vielä ole
# (CREATE TABLE IF NOT EXISTS -> turvallinen ajaa joka kerta).
def connect_db():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ultrasound (
            id SERIAL PRIMARY KEY,
            institutionname TEXT,
            institutionaldepartmentname TEXT,
            manufacturer TEXT,
            modality TEXT,
            stationname TEXT,
            seriesdate TEXT,
            instance TEXT,
            serie TEXT,
            S_depth FLOAT,
            U_cov FLOAT,
            U_skew FLOAT,
            U_low FLOAT[]
        )
    """)
    conn.commit()
    cur.close()
    return conn

# 🔹 Yhdistetään Fetch Serviceen
# Luo gRPC-stub (asiakaspää) Fetch Serviceen, isolla viestikoolla (200 MB)
# koska DICOM-tavut voivat olla suuria.
def get_fetch_stub():
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)

# gRPC-käsittelijäluokka. Toteuttaa analyze_service.proto:ssa määritellyn rajapinnan.
class AnalyzeService(analyze_service_pb2_grpc.AnalyzeServiceServicer):
    # Analysoi kaikki Orthancissa olevat sarjat kerralla. gRPC kutsuu tätä kun
    # asiakas (esim. ajastin tai testiskripti) pyytää analyysin käynnistystä.
    def AnalyzeAllDicomData(self, request, context):
        logger.info("📡 Received request to analyze all series in Orthanc")

        # 🔍 Haetaan kaikki sarjat Orthancista (REST /series palauttaa id-listan).
        response = requests.get(f"{ORTHANC_URL}/series")
        if response.status_code != 200:
            logger.error("❌ Error: Could not fetch series from Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_pb2.AnalyzeResponse(message="No series found", series_id="ALL")

        series_list = response.json()
        if not series_list:
            logger.warning("❌ No series found in Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_pb2.AnalyzeResponse(message="No series available", series_id="ALL")

        fetch_stub = get_fetch_stub()   # yhteys Fetch Serviceen
        conn = connect_db()             # yhteys tietokantaan (+ taulun varmistus)
        cur = conn.cursor()

        # Käydään jokainen sarja läpi.
        for series_id in series_list:
            logger.info("📡 Processing series ID: %s", series_id)

            # 🔍 Haetaan sarjan instanssit Orthancista (yksi sarja voi sisältää monta kuvaa).
            instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances")
            if instance_response.status_code != 200:
                logger.error("❌ Could not fetch instances for series %s", series_id)
                continue  # Ohitetaan tämä sarja

            instance_list = instance_response.json()
            if not instance_list:
                logger.warning("❌ No instances found for series %s", series_id)
                continue  # Ohitetaan tämä sarja

            # Käydään sarjan jokainen instanssi (kuva) läpi.
            for instance in instance_list:
                instance_id = instance["ID"]
                logger.info("📡 Fetching instance ID: %s", instance_id)

                # 🔍 Haetaan DICOM-data Fetch-palvelulta (gRPC-kutsu).
                fetch_response = fetch_stub.FetchDicomData(fetch_service_pb2.FetchRequest(instance_id=instance_id))

                if not fetch_response.dicom_data:
                    logger.warning("❌ No data received for instance %s", instance_id)
                    continue  # Ohitetaan tämä instanssi

                # 🔄 Muutetaan binääridata DICOM-muotoon (pydicom lukee muistipuskurista).
                dicom_bytes = io.BytesIO(fetch_response.dicom_data)
                try:
                    dicom_dataset = pydicom.dcmread(dicom_bytes, force=True)
                    logger.info("✅ DICOM data successfully read!")
                except InvalidDicomError as e:
                    logger.error("❌ Error reading DICOM file: %s", e)
                    continue  # Ohitetaan tämä instanssi

                # 🔍 Haetaan DICOM-metadatasta tarvittavat kentät (puuttuva -> "Unknown").
                metadata = {
                    "InstitutionName": dicom_dataset.get("InstitutionName", "Unknown"),
                    "InstitutionalDepartmentName": dicom_dataset.get("InstitutionalDepartmentName", "Unknown"),
                    "Manufacturer": dicom_dataset.get("Manufacturer", "Unknown"),
                    "Modality": dicom_dataset.get("Modality", "Unknown"),
                    "StationName": dicom_dataset.get("StationName", "Unknown"),
                    "SeriesDate": dicom_dataset.get("SeriesDate", "Unknown")
                }

                # Hajautettu reititys: jokainen palvelu suodattaa itse modaliteetin
                # mukaan. US-palvelu käsittelee vain ultraäänikuvat, muut ohitetaan.
                if metadata["Modality"] != "US":
                    logger.info("❌ Not an ultrasound image. Skipping instance %s", instance_id)
                    continue  # Ohitetaan tämä instanssi

                # 📊 Analysoidaan kuva: pikselimatriisi + metadata -> QA-metriikat.
                image_array = dicom_dataset.pixel_array
                analysis = imageQualityUS(dicom_dataset, dicom_bytes, image_array, "probe-LUT.xls")
                result = analysis.MAIN_US_analysis()

                # 🔹 Muunnetaan tulokset JSON-/DB-yhteensopivaan muotoon: numpy-tyypit
                #    (float64, ndarray) muunnetaan Pythonin perustyypeiksi.
                json_result = {
                    key: float(value) if isinstance(value, np.float64)
                    else value.tolist() if isinstance(value, np.ndarray)
                    else value for key, value in result.items()
                }

                # 📂 Tallennetaan analyysitulokset tietokantaan (yksi rivi per kuva).
                cur.execute("""
                    INSERT INTO ultrasound (
                        institutionname, institutionaldepartmentname, manufacturer, modality, 
                        stationname, seriesdate, instance, serie, S_depth, U_cov, U_skew, U_low
                    ) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    [float(val) for val in json_result['U_low']]
                ))

        # Vahvista kaikki INSERTit kerralla ja sulje yhteys.
        conn.commit()
        cur.close()
        conn.close()

        return analyze_service_pb2.AnalyzeResponse(message="Analysis complete for all series!", series_id="ALL")

# Käynnistä gRPC-palvelin portissa 50052 ja jää kuuntelemaan pyyntöjä.
def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    analyze_service_pb2_grpc.add_AnalyzeServiceServicer_to_server(AnalyzeService(), server)
    server.add_insecure_port("[::]:50052")
    server.start()
    logger.info("🚀 Analyze Service running on port 50052")
    server.wait_for_termination()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    serve()


