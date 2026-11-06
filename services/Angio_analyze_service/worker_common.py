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

import pymssql
from prometheus_client import Counter, Histogram, start_http_server

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("worker")

DB_CONFIG = {
    "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
    "port": str(os.getenv("DATABASE_PORT", "1433")),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "database": os.getenv("DATABASE_NAME", "QA-results"),
}
WORKER_ID = os.getenv("HOSTNAME", "worker")
CLAIM_TIMEOUT_SECONDS = int(os.getenv("CLAIM_TIMEOUT_SECONDS", "300"))
RECEIVE_TIMEOUT_MS = int(os.getenv("RECEIVE_TIMEOUT_MS", "5000"))
METRICS_PORT = int(os.getenv("METRICS_PORT", "9110"))

# Jaetut metriikat (sama nimistö kaikille modaliteeteille -> monitorointi ennallaan).
IMAGES_PROCESSED = Counter("autoqad_images_processed_total", "Analysoidut kuvat.", ["modality", "status"])
ANALYSIS_DURATION = Histogram("autoqad_analysis_duration_seconds", "Analyysin kesto (s).", ["modality"],
                              buckets=(0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128))
QA_RESULTS = Counter("autoqad_qa_results_total", "Tallennetut QA-tulokset.", ["modality"])
JOBS = Counter("autoqad_jobs_total", "Job-tilasiirtymät.", ["modality", "state"])


def connect_db():
    return pymssql.connect(**DB_CONFIG)


class EventWorker:
    def __init__(self, modality, queue, job_table, process_fn):
        self.modality = modality
        self.queue = queue
        self.job_table = job_table
        self.process_fn = process_fn

    # --- Service Broker doorbell -------------------------------------------
    def drain_doorbell(self, cur, conn):
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
            return None
        JOBS.labels(modality=self.modality, state="claimed").inc()
        return {"id": row[0], "orthanc_id": row[1], "station_name": row[2], "study_instance_uid": row[3]}

    def set_status(self, cur, conn, job_id, status, error=None):
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
        IMAGES_PROCESSED.labels(modality=self.modality, status="success").inc()
        QA_RESULTS.labels(modality=self.modality).inc()
        self.set_status(cur, conn, job_id, "COMPLETED")

    def observe_duration(self, seconds):
        ANALYSIS_DURATION.labels(modality=self.modality).observe(seconds)

    # --- Pääsilmukka --------------------------------------------------------
    def run(self):
        start_http_server(METRICS_PORT)
        logger.info("📈 Metriikat portissa %s", METRICS_PORT)
        logger.info("🚀 %s event-driven worker '%s' (queue=%s, table=%s)",
                    self.modality, WORKER_ID, self.queue, self.job_table)
        conn = connect_db()
        cur = conn.cursor()
        while True:
            try:
                self.drain_doorbell(cur, conn)
                self.reclaim_stale(cur, conn)
                while True:
                    job = self.claim_job(cur, conn)
                    if not job:
                        break
                    try:
                        self.process_fn(self, cur, conn, job)
                    except Exception as e:  # noqa: BLE001
                        logger.error("❌ Job %s FAILED: %s", job.get("id"), e)
                        IMAGES_PROCESSED.labels(modality=self.modality, status="failed").inc()
                        try:
                            self.set_status(cur, conn, job["id"], "FAILED",
                                            error=f"{e}\n{traceback.format_exc()[:1500]}")
                        except Exception:  # noqa: BLE001
                            conn = connect_db(); cur = conn.cursor()
            except Exception as e:  # noqa: BLE001
                logger.error("Silmukkavirhe, jatketaan: %s", e)
                time.sleep(2)
                try:
                    conn = connect_db(); cur = conn.cursor()
                except Exception:  # noqa: BLE001
                    time.sleep(5)
