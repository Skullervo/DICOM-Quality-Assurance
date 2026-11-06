"""Jaettu event-driven worker -runko (manuscript §2.2.4).

Kapseloi kaiken modaliteetista riippumattoman: Service Broker -doorbell, atominen
claim job-taulusta (READPAST), reclaim, tilasiirtymät ja Prometheus-metriikat.
Modaliteettikohtainen worker antaa vain process_fn:n joka tekee analyysin + insertin.

Käyttö:
    from worker_common import EventWorker
    def process(wk, cur, conn, job):
        wk.set_status(cur, conn, job["id"], "RUNNING")
        ... analyysi + S3 + INSERT ...
        wk.mark_success(cur, conn, job["id"])   # COMPLETED + metriikat
    EventWorker("CR", "XRJobQueue", "xray_jobs", process).run()
"""
import os
import time
import logging
import traceback

import pymssql                              # MS SQL Server -ajuri
from prometheus_client import Counter, Histogram, start_http_server  # metriikat

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("worker")

# Tietokanta-asetukset ympäristömuuttujista (sama DB kuin pollereilla).
DB_CONFIG = {
    "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
    "port": str(os.getenv("DATABASE_PORT", "1433")),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "database": os.getenv("DATABASE_NAME", "QA-results"),
}
# WORKER_ID = yksilöivä tunniste (kontin HOSTNAME). Kirjataan claimed_by-kenttään,
# jotta nähdään kuka jobin varasi ja voidaan vapauttaa kaatuneen workerin jobit.
WORKER_ID = os.getenv("HOSTNAME", "worker")
# Kuinka vanha varaus katsotaan "jumiin jääneeksi" ja vapautetaan (sekunteina).
CLAIM_TIMEOUT_SECONDS = int(os.getenv("CLAIM_TIMEOUT_SECONDS", "300"))
# Kuinka kauan odotetaan Service Broker -viestiä ennen kuin luovutetaan (ms).
RECEIVE_TIMEOUT_MS = int(os.getenv("RECEIVE_TIMEOUT_MS", "5000"))
# Portti josta Prometheus lukee tämän workerin metriikat.
METRICS_PORT = int(os.getenv("METRICS_PORT", "9110"))

# Jaetut Prometheus-metriikat (sama nimistö kaikille modaliteeteille -> olemassa
# oleva monitorointi/Grafana toimii ennallaan). "modality"-label erottaa US/XR/CT.
IMAGES_PROCESSED = Counter("autoqad_images_processed_total", "Analysoidut kuvat.", ["modality", "status"])
ANALYSIS_DURATION = Histogram("autoqad_analysis_duration_seconds", "Analyysin kesto (s).", ["modality"],
                              buckets=(0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128))
QA_RESULTS = Counter("autoqad_qa_results_total", "Tallennetut QA-tulokset.", ["modality"])
JOBS = Counter("autoqad_jobs_total", "Job-tilasiirtymät.", ["modality", "state"])


def connect_db():
    return pymssql.connect(**DB_CONFIG)


class EventWorker:
    # Yleiskäyttöinen event-driven-workerin runko. Modaliteettikohtainen worker
    # (XR/CT/US) antaa vain:
    #   modality   = metriikka-label (esim. "CR", "CT")
    #   queue      = Service Broker -jono josta "doorbell"-herätteet luetaan
    #   job_table  = job-taulu joka on tilan TOTUUDEN LÄHDE (esim. "xray_jobs")
    #   process_fn = funktio joka tekee varsinaisen analyysin + tallennuksen
    def __init__(self, modality, queue, job_table, process_fn):
        self.modality = modality
        self.queue = queue
        self.job_table = job_table
        self.process_fn = process_fn

    # --- Service Broker doorbell -------------------------------------------
    def drain_doorbell(self, cur, conn):
        # "Doorbell" = Service Broker -viesti on pelkkä HERÄTE ("töitä on jonossa").
        # Varsinainen työ luetaan job-taulusta, ei viestistä. Tässä vain tyhjennetään
        # jonosta kertyneet herätteet ja lopetetaan keskustelut (END CONVERSATION),
        # ettei jono täyty. WAITFOR...TIMEOUT estää ikuisen odotuksen.
        sql = (
            "SET NOCOUNT ON;\n"
            "DECLARE @h UNIQUEIDENTIFIER, @mt SYSNAME, @n INT=0;\n"
            f"WAITFOR (RECEIVE TOP(1) @h=conversation_handle, @mt=message_type_name FROM {self.queue}), TIMEOUT {RECEIVE_TIMEOUT_MS};\n"
            "WHILE @h IS NOT NULL\n"
            "BEGIN\n"
            "  END CONVERSATION @h;\n"
            "  SET @h=NULL; SET @n=@n+1; IF @n>=50 BREAK;\n"
            f"  RECEIVE TOP(1) @h=conversation_handle, @mt=message_type_name FROM {self.queue};\n"
            "END"
        )
        cur.execute(sql)
        conn.commit()

    # --- Varaukset ----------------------------------------------------------
    def reclaim_stale(self, cur, conn):
        # Vapauttaa "jumiin jääneet" jobit takaisin QUEUED-tilaan: jos worker
        # kaatui kesken (CLAIMED/RUNNING) eikä varaus ole päivittynyt
        # CLAIM_TIMEOUT_SECONDS:iin, toinen worker saa ottaa jobin uudelleen.
        # DATEADD(SECOND, -timeout, nyt) = aikaraja, jota vanhemmat varaukset vapautetaan.
        cur.execute(
            f"UPDATE {self.job_table} SET status='QUEUED', claimed_by=NULL, updated_at=SYSUTCDATETIME() "
            "WHERE status IN ('CLAIMED','RUNNING') "
            "AND claimed_at < DATEADD(SECOND, %d, SYSUTCDATETIME())",
            (-CLAIM_TIMEOUT_SECONDS,),
        )
        if cur.rowcount:
            logger.info("Vapautettiin %d vanhentunutta jobia (%s)", cur.rowcount, self.job_table)
        conn.commit()

    def claim_job(self, cur, conn):
        # ATOMINEN VARAUS: valitsee yhden QUEUED-jobin ja merkitsee sen heti
        # CLAIMED-tilaan samassa lauseessa. WITH (READPAST, ROWLOCK, UPDLOCK):
        #   - READPAST = ohita rivit jotka toinen worker jo lukitsi (ei jää jonoon)
        #   - ROWLOCK/UPDLOCK = lukitse vain tämä rivi päivitystä varten
        # Näin useampi rinnakkainen worker (competing consumers) EI voi varata
        # samaa jobia kahdesti eikä jää odottamaan toisiaan. OUTPUT palauttaa
        # varatun jobin kentät samassa kutsussa. attempts kasvaa joka yrityksellä.
        cur.execute(
            f"WITH cte AS (SELECT TOP(1) * FROM {self.job_table} WITH (READPAST, ROWLOCK, UPDLOCK) "
            "WHERE status='QUEUED' ORDER BY id) "
            "UPDATE cte SET status='CLAIMED', claimed_by=%s, claimed_at=SYSUTCDATETIME(), "
            "attempts=attempts+1, updated_at=SYSUTCDATETIME() "
            "OUTPUT inserted.id, inserted.orthanc_id, inserted.station_name, inserted.study_instance_uid",
            (WORKER_ID,),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            return None  # ei vapaita jobeja juuri nyt
        JOBS.labels(modality=self.modality, state="claimed").inc()
        # Palautetaan job selkeänä sanakirjana process_fn:lle.
        return {"id": row[0], "orthanc_id": row[1], "station_name": row[2], "study_instance_uid": row[3]}

    def set_status(self, cur, conn, job_id, status, error=None):
        # Päivittää jobin tilan ja aikaleimat tilakoneen mukaisesti:
        #   started_at asetetaan kun siirrytään RUNNING-tilaan,
        #   completed_at kun siirrytään COMPLETED/FAILED-tilaan.
        # CASE-lauseet varmistavat, ettei aiempaa aikaleimaa ylikirjoiteta turhaan.
        cur.execute(
            f"UPDATE {self.job_table} SET status=%s, error_message=%s, updated_at=SYSUTCDATETIME(), "
            "started_at=CASE WHEN %s='RUNNING' THEN SYSUTCDATETIME() ELSE started_at END, "
            "completed_at=CASE WHEN %s IN ('COMPLETED','FAILED') THEN SYSUTCDATETIME() ELSE completed_at END "
            "WHERE id=%s",
            (status, error, status, status, job_id),
        )
        conn.commit()
        JOBS.labels(modality=self.modality, state=status.lower()).inc()

    def mark_success(self, cur, conn, job_id):
        # Onnistuneen jobin päätös: kasvatetaan onnistumis- ja QA-tulosmetriikat
        # ja merkitään job COMPLETED-tilaan.
        IMAGES_PROCESSED.labels(modality=self.modality, status="success").inc()
        QA_RESULTS.labels(modality=self.modality).inc()
        self.set_status(cur, conn, job_id, "COMPLETED")

    def observe_duration(self, seconds):
        # Kirjaa analyysin keston Prometheus-histogrammiin.
        ANALYSIS_DURATION.labels(modality=self.modality).observe(seconds)

    # --- Pääsilmukka --------------------------------------------------------
    def run(self):
        # Workerin elinikäinen silmukka. Käynnistää ensin metriikkapalvelimen,
        # sitten jatkaa ikuisesti: herätteet -> vapauta jumiutuneet -> varaa ja
        # käsittele kaikki jonossa olevat jobit -> takaisin odottamaan herätettä.
        start_http_server(METRICS_PORT)
        logger.info("📈 Metriikat portissa %s", METRICS_PORT)
        logger.info("🚀 %s event-driven worker '%s' (queue=%s, table=%s)",
                    self.modality, WORKER_ID, self.queue, self.job_table)
        conn = connect_db()
        cur = conn.cursor()
        while True:
            try:
                # 1) Odota/tyhjennä doorbell-herätteet (herää kun töitä on).
                self.drain_doorbell(cur, conn)
                # 2) Vapauta kaatuneiden workerien jumiin jääneet varaukset.
                self.reclaim_stale(cur, conn)
                # 3) Varaa ja käsittele jobeja kunnes jono on tyhjä.
                while True:
                    job = self.claim_job(cur, conn)
                    if not job:
                        break  # ei enää vapaita jobeja -> takaisin odottamaan herätettä
                    try:
                        # Modaliteettikohtainen työ (analyysi + tallennus + mark_success).
                        self.process_fn(self, cur, conn, job)
                    except Exception as e:  # noqa: BLE001
                        # Yhden jobin kaatuminen ei saa kaataa workeria: merkitään
                        # job FAILED-tilaan (virheviesti + lyhennetty traceback).
                        logger.error("❌ Job %s FAILED: %s", job.get("id"), e)
                        IMAGES_PROCESSED.labels(modality=self.modality, status="failed").inc()
                        try:
                            self.set_status(cur, conn, job["id"], "FAILED",
                                            error=f"{e}\n{traceback.format_exc()[:1500]}")
                        except Exception:  # noqa: BLE001
                            # Jos jopa tilan kirjaus epäonnistui, DB-yhteys on
                            # todennäköisesti rikki -> avataan uusi yhteys.
                            conn = connect_db(); cur = conn.cursor()
            except Exception as e:  # noqa: BLE001
                # Koko silmukan taso: esim. DB-yhteys katkesi. Odotetaan hetki ja
                # yritetään avata yhteys uudelleen -> worker toipuu itsestään.
                logger.error("Silmukkavirhe, jatketaan: %s", e)
                time.sleep(2)
                try:
                    conn = connect_db(); cur = conn.cursor()
                except Exception:  # noqa: BLE001
                    time.sleep(5)
