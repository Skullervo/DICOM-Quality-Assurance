"""AutoQAD US analysis worker — event-driven (manuscript §2.2.4).

Korvaa pollaus/claim/sharding-mallin (analyze_service_timed.py) tapahtumapohjaisella
mallilla. Ajetaan RINNALLE; cutover tehdään vasta kun tämä on testattu.

Virta:
  1. WAITFOR RECEIVE USJobQueue (Service Broker -herätys, "doorbell")
  2. Reclaim: vapauta vanhentuneet CLAIMED/RUNNING-jobit (kuollut worker)
  3. Claim seuraava QUEUED-job atomisesti taulusta (UPDATE ... READPAST)
  4. Hae DICOM Orthancista (REST /instances/{id}/file — WADO-vastaava)
  5. Analysoi (US_IQ_analysis3.imageQualityUS)
  6. Renderöi PNG + tallenna S3:een (object storage)
  7. Kirjaa tulokset ultrasound-tauluun + S3-polku
  8. Merkitse job COMPLETED / FAILED

Totuuden lähde on job-taulu: kadonnut/kahdentunut Service Broker -viesti ei
johda kadonneeseen/kahteen kertaan ajettuun jobiin (claim on atominen).
"""
import io
import os
import time
import json
import logging
import traceback

import numpy as np
import cv2
import requests
import pymssql
import pydicom
from pydicom.errors import InvalidDicomError
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import generate_uid, SecondaryCaptureImageStorage, ExplicitVRLittleEndian
from PIL import Image
from prometheus_client import Counter, Histogram, start_http_server

from US_IQ_analysis3 import imageQualityUS
import s3_client

# Suoristettu näyttökuva: konveksin anturin kuva suoristetaan ja tallennetaan
# Orthanciin DERIVED Secondary Capture -DICOMina (Modality=SC -> ei uudelleenanalyysiä),
# linkki ultrasound.straightened_instance. Go-backend tarjoilee sen laitesivulla.
# Kytke pois perf-mittauksissa: STRAIGHTEN_US=0.
STRAIGHTEN_US = os.getenv("STRAIGHTEN_US", "1") == "1"

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("us_worker")

# --- Konfiguraatio ---
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "admin")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "")
ORTHANC_AUTH = (ORTHANC_USERNAME, ORTHANC_PASSWORD) if ORTHANC_USERNAME else None

DB_CONFIG = {
    "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
    "port": str(os.getenv("DATABASE_PORT", "1433")),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "database": os.getenv("DATABASE_NAME", "QA-results"),
}

WORKER_ID = os.getenv("HOSTNAME", "us-worker")
QUEUE = "USJobQueue"
CLAIM_TIMEOUT_SECONDS = int(os.getenv("CLAIM_TIMEOUT_SECONDS", "300"))
RECEIVE_TIMEOUT_MS = int(os.getenv("RECEIVE_TIMEOUT_MS", "5000"))
METRICS_PORT = int(os.getenv("METRICS_PORT", "9110"))

# --- Prometheus-metriikat (sama nimistö kuin pollerilla -> monitorointi ennallaan) ---
IMAGES_PROCESSED = Counter("autoqad_images_processed_total", "Analysoidut kuvat.", ["modality", "status"])
ANALYSIS_DURATION = Histogram("autoqad_analysis_duration_seconds", "Analyysin kesto (s).", ["modality"],
                              buckets=(0.25, 0.5, 1, 2, 4, 8, 16, 32, 64))
QA_RESULTS = Counter("autoqad_qa_results_total", "Tallennetut QA-tulokset.", ["modality"])
JOBS = Counter("autoqad_jobs_total", "Job-tilasiirtymät.", ["modality", "state"])
# QA-verdikti per mittaus (toleranssiluokittelu) — QA-hälytyksen lähde.
QA_VERDICT = Counter("autoqad_qa_verdict_total", "QA-verdikti per mittaus toleransseja vasten.",
                     ["modality", "station", "verdict"])

# tolerance_config-metriikka-id -> US-analyysin result-avain
US_METRIC_KEYS = {"s_depth": "S_depth", "u_cov": "U_cov", "u_skew": "U_skew"}
# Ladataan tolerance_configista run()-silmukassa (sama lähde kuin frontend/go-backend).
TOLERANCES: dict = {}


def connect_db():
    return pymssql.connect(**DB_CONFIG)


# --- QA-toleranssit + luokittelu (sama logiikka kuin frontendin deriveStatus) ---
def load_tolerances(cur) -> dict:
    """Lataa US-toleranssit tolerance_configista. Tyhjä jos taulu puuttuu."""
    try:
        cur.execute(
            "SELECT metric_id, nominal, lower_limit, upper_limit, action_limit, lower_warn, upper_warn "
            "FROM tolerance_config WHERE modality='US'"
        )
        cols = ("nominal", "lower_limit", "upper_limit", "action_limit", "lower_warn", "upper_warn")
        return {r[0]: dict(zip(cols, r[1:])) for r in cur.fetchall()}
    except Exception as e:  # noqa: BLE001 — taulu voi puuttua / transientti virhe
        logger.warning("Toleranssien lataus epäonnistui: %s", e)
        return {}


def _derive_status(v, lim) -> str:
    # Luokittele yksittäinen mittausarvo v toleranssirajoja (lim) vasten:
    #   fail = kovien raja-arvojen (lower/upper_limit) ulkopuolella
    #   warn = toimenpiderajan (nominal +/- action_limit) tai varoitusrajojen ulkona
    #   pass = rajojen sisällä
    # Sama logiikka kuin frontendin deriveStatus -> näyttö ja hälytys täsmäävät.
    if v is None:
        return "nodata"
    lo, hi = lim.get("lower_limit"), lim.get("upper_limit")
    if lo is not None and v < lo:
        return "fail"
    if hi is not None and v > hi:
        return "fail"
    nom, act = lim.get("nominal"), lim.get("action_limit")
    lw, uw = lim.get("lower_warn"), lim.get("upper_warn")
    if act is not None and nom is not None and abs(v - nom) > act:
        return "warn"
    if lw is not None and v < lw:
        return "warn"
    if uw is not None and v > uw:
        return "warn"
    return "pass"


def _has_tol(lim) -> bool:
    return any(lim.get(k) is not None for k in
               ("lower_limit", "upper_limit", "action_limit", "lower_warn", "upper_warn"))


def qa_verdict(jr) -> str:
    """Mittauksen kokonaisverdikti toleransseja vasten (ankarin voittaa)."""
    statuses = []
    for mid, key in US_METRIC_KEYS.items():
        lim = TOLERANCES.get(mid)
        val = jr.get(key)
        if lim and _has_tol(lim) and val is not None:
            try:
                statuses.append(_derive_status(float(val), lim))
            except (TypeError, ValueError):
                pass
    if not statuses:
        return "nodata"
    if "fail" in statuses:
        return "fail"
    if "warn" in statuses:
        return "warn"
    return "pass"


def ensure_columns(cur):
    """Idempotentti: ultrasound.output_image_path (S3-polku)."""
    cur.execute("""
        IF COL_LENGTH('dbo.ultrasound','output_image_path') IS NULL
            ALTER TABLE dbo.ultrasound ADD output_image_path NVARCHAR(512) NULL
    """)
    cur.execute("""
        IF COL_LENGTH('dbo.ultrasound','processing_time') IS NULL
            ALTER TABLE dbo.ultrasound ADD processing_time FLOAT NULL
    """)


def drain_doorbell(cur, conn):
    """Odota herätystä USJobQueuesta (max RECEIVE_TIMEOUT_MS) ja kuittaa viestit.

    Viestin sisältö on vihje — työ varataan taulusta. END CONVERSATION siivoaa
    sekä data- että EndDialog-viestit, ettei jonoon jää roikkumaan keskusteluja.
    """
    sql = (
        "SET NOCOUNT ON;\n"
        "DECLARE @h UNIQUEIDENTIFIER, @mt SYSNAME, @n INT=0;\n"
        f"WAITFOR (RECEIVE TOP(1) @h=conversation_handle, @mt=message_type_name FROM {QUEUE}), TIMEOUT {RECEIVE_TIMEOUT_MS};\n"
        "WHILE @h IS NOT NULL\n"
        "BEGIN\n"
        "  END CONVERSATION @h;\n"
        "  SET @h=NULL; SET @n=@n+1; IF @n>=50 BREAK;\n"
        f"  RECEIVE TOP(1) @h=conversation_handle, @mt=message_type_name FROM {QUEUE};\n"
        "END"
    )
    cur.execute(sql)
    conn.commit()


def reclaim_stale(cur, conn):
    """Vapauta vanhentuneet varaukset takaisin QUEUEDiin (kuollut/jumittunut worker)."""
    cur.execute(
        "UPDATE us_jobs SET status='QUEUED', claimed_by=NULL, updated_at=SYSUTCDATETIME() "
        "WHERE status IN ('CLAIMED','RUNNING') "
        "AND claimed_at < DATEADD(SECOND, %d, SYSUTCDATETIME())",
        (-CLAIM_TIMEOUT_SECONDS,),
    )
    if cur.rowcount:
        logger.info("Vapautettiin %d vanhentunutta jobia", cur.rowcount)
    conn.commit()


def claim_job(cur, conn):
    """Varaa vanhin QUEUED-job atomisesti. READPAST -> rinnakkaiset workerit ohittavat
    lukitut rivit (competing consumers). Palauttaa dict tai None."""
    cur.execute(
        "WITH cte AS ("
        "  SELECT TOP(1) * FROM us_jobs WITH (READPAST, ROWLOCK, UPDLOCK) "
        "  WHERE status='QUEUED' ORDER BY id"
        ") "
        "UPDATE cte SET status='CLAIMED', claimed_by=%s, claimed_at=SYSUTCDATETIME(), "
        "attempts=attempts+1, updated_at=SYSUTCDATETIME() "
        "OUTPUT inserted.id, inserted.orthanc_id, inserted.station_name, inserted.study_instance_uid",
        (WORKER_ID,),
    )
    row = cur.fetchone()
    conn.commit()
    if not row:
        return None
    JOBS.labels(modality="US", state="claimed").inc()
    return {"id": row[0], "orthanc_id": row[1], "station_name": row[2], "study_instance_uid": row[3]}


def set_status(cur, conn, job_id, status, error=None):
    cur.execute(
        "UPDATE us_jobs SET status=%s, error_message=%s, updated_at=SYSUTCDATETIME(), "
        "started_at=CASE WHEN %s='RUNNING' THEN SYSUTCDATETIME() ELSE started_at END, "
        "completed_at=CASE WHEN %s IN ('COMPLETED','FAILED') THEN SYSUTCDATETIME() ELSE completed_at END "
        "WHERE id=%s",
        (status, error, status, status, job_id),
    )
    conn.commit()
    JOBS.labels(modality="US", state=status.lower()).inc()


def fetch_dicom(orthanc_id):
    # Hae DICOM-tiedosto suoraan Orthancin REST-rajapinnasta (event-driven
    # mallissa EI käytetä Fetch Servicea). raise_for_status nostaa virheen jos
    # haku epäonnistui -> job merkitään FAILED pääsilmukassa.
    r = requests.get(f"{ORTHANC_URL}/instances/{orthanc_id}/file", auth=ORTHANC_AUTH, timeout=60)
    r.raise_for_status()
    return r.content


def render_png(pixel_array) -> bytes:
    """Normalisoi kuva uint8:ksi ja koodaa PNG:ksi (S3-tallennettava output)."""
    a = pixel_array.astype(np.float32)
    a -= a.min()
    mx = a.max()
    if mx > 0:
        a /= mx
    a = (a * 255).astype(np.uint8)
    if a.ndim == 3 and a.shape[2] >= 3:
        img = Image.fromarray(a[:, :, :3], "RGB")
    elif a.ndim == 3:
        img = Image.fromarray(a[:, :, 0], "L")
    else:
        img = Image.fromarray(a, "L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _build_sc_dicom(orig_ds, straight_u8):
    """DERIVED Secondary Capture -DICOM suoristetusta kuvasta (ks. straighten_us_backfill.py)."""
    new_sop = generate_uid()
    fm = FileMetaDataset()
    fm.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    fm.MediaStorageSOPInstanceUID = new_sop
    fm.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(None, {}, file_meta=fm, preamble=b"\x00" * 128)
    for tag in ("PatientID", "PatientName", "PatientBirthDate", "PatientSex",
                "StudyInstanceUID", "StudyDate", "StudyTime", "StudyID",
                "AccessionNumber", "ReferringPhysicianName",
                "StationName", "InstitutionName", "InstitutionalDepartmentName",
                "Manufacturer", "ManufacturerModelName", "DeviceSerialNumber"):
        if tag in orig_ds:
            setattr(ds, tag, getattr(orig_ds, tag))
    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = new_sop
    ds.SeriesInstanceUID = generate_uid()
    ds.Modality = "SC"                        # -> US-analyysi/ingestion ohittaa
    ds.ConversionType = "WSD"
    ds.ImageType = ["DERIVED", "SECONDARY"]
    ds.SeriesDescription = "STRAIGHTENED US (derived)"
    ds.SeriesNumber = 9001
    ds.InstanceNumber = 1
    ref = Dataset()
    ref.ReferencedSOPClassUID = orig_ds.get("SOPClassUID", "")
    ref.ReferencedSOPInstanceUID = orig_ds.get("SOPInstanceUID", "")
    ds.ReferencedImageSequence = [ref]
    arr = np.ascontiguousarray(straight_u8.astype(np.uint8))
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows, ds.Columns = arr.shape
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = arr.tobytes()
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    out = io.BytesIO()
    ds.save_as(out, write_like_original=False)
    return out.getvalue()


def straighten_and_store(analysis, image_array, orig_ds, result):
    """Konveksille anturille: suorista (result['im_t']) -> SC-DICOM -> Orthanc.
    Palauttaa SC-instanssin Orthanc-UUID:n tai None. Best-effort (ei kaada analyysiä)."""
    if not STRAIGHTEN_US:
        return None
    try:
        if not analysis.is_convex(image_array):
            return None  # lineaarinen -> ei suoristeta (USImage näyttää raa'an)
        im_t = result.get("im_t")
        if im_t is None:
            return None
        u8 = cv2.normalize(np.asarray(im_t).astype(np.float32), None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        sc_bytes = _build_sc_dicom(orig_ds, u8)
        r = requests.post(f"{ORTHANC_URL}/instances", data=sc_bytes, auth=ORTHANC_AUTH,
                          headers={"Content-Type": "application/dicom"}, timeout=30)
        r.raise_for_status()
        return r.json().get("ID")
    except Exception as e:  # noqa: BLE001
        logger.warning("Suoristus/SC-tallennus epäonnistui: %s", e)
        return None


# Yhden varatun jobin koko käsittely: hae DICOM -> analysoi -> tallenna S3 + DB.
# Nostaa poikkeuksen virhetilanteessa (pääsilmukka merkitsee jobin FAILED).
def process_job(cur, conn, job):
    job_id = job["id"]
    orthanc_id = job["orthanc_id"]
    set_status(cur, conn, job_id, "RUNNING")   # merkitse työ käynnissä olevaksi

    # Hae DICOM Orthancista ja lue se pydicomilla muistipuskurista.
    dicom_bytes = io.BytesIO(fetch_dicom(orthanc_id))
    try:
        ds = pydicom.dcmread(dicom_bytes, force=True)
    except InvalidDicomError as e:
        raise RuntimeError(f"InvalidDicom: {e}") from e

    # Poimi DICOM-metadatasta tallennettavat kentät (puuttuva -> oletusarvo).
    meta = {
        "InstitutionName": ds.get("InstitutionName", "Unknown"),
        "InstitutionalDepartmentName": ds.get("InstitutionalDepartmentName", "Unknown"),
        "Manufacturer": ds.get("Manufacturer", "Unknown"),
        "ManufacturerModelName": ds.get("ManufacturerModelName", ""),
        "Modality": ds.get("Modality", "US"),
        "StationName": ds.get("StationName", job.get("station_name", "Unknown")),
        "SeriesDate": ds.get("SeriesDate", ""),
        "StudyDate": ds.get("StudyDate", ""),
        "ContentDate": ds.get("ContentDate", ""),
        "DeviceSerialNumber": ds.get("DeviceSerialNumber", ""),
        "ContentTime": ds.get("ContentTime", ""),
    }
    # Varmista modaliteetti (ingestionin pitäisi reitittää oikein, tämä on suoja).
    if str(meta["Modality"]).upper() != "US":
        raise RuntimeError(f"Not US modality: {meta['Modality']}")

    # Varsinainen kuva-analyysi; mitataan kesto metriikkaa varten.
    image_array = ds.pixel_array
    t0 = time.time()
    analysis = imageQualityUS(ds, dicom_bytes, image_array, "probe-LUT.xls")
    result = analysis.MAIN_US_analysis()
    processing_time = time.time() - t0
    ANALYSIS_DURATION.labels(modality="US").observe(processing_time)

    # Muunna numpy-tyypit (float64/ndarray) Pythonin perustyypeiksi DB/JSON-tallennusta varten.
    jr = {
        k: (float(v) if isinstance(v, np.float64) else v.tolist() if isinstance(v, np.ndarray) else v)
        for k, v in result.items()
    }

    # Renderöi + tallenna analyysikuva S3:een (hierarkkinen avain qa/us/<study>/<instance>.png)
    study_key = job.get("study_instance_uid") or orthanc_id
    s3_key = f"qa/us/{study_key}/{orthanc_id}.png"
    output_path = ""
    try:
        output_path = s3_client.upload_bytes(s3_key, render_png(image_array), "image/png")
    except Exception as e:  # noqa: BLE001 — S3-virhe ei saa kaataa analyysiä
        logger.warning("S3-upload epäonnistui (%s): %s", s3_key, e)

    # Suoristettu näyttökuva (konveksi) -> SC-DICOM Orthanciin + linkki
    straightened = straighten_and_store(analysis, image_array, ds, result)

    # Tallenna analyysitulokset ultrasound-tauluun (yksi rivi per kuva). Lista-/
    # profiilikentät serialisoidaan JSON-tekstiksi (json.dumps).
    cur.execute(
        """
        INSERT INTO ultrasound (
            institutionname, institutionaldepartmentname, manufacturer, modality,
            stationname, seriesdate, instance, s_depth, u_cov, u_skew, u_low,
            horiz_prof, vert_prof, tranducertype,
            manufacturermodelname, studydate, contentdate, deviceserialnumber, contenttime,
            processing_time, output_image_path, straightened_instance
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            meta["InstitutionName"], meta["InstitutionalDepartmentName"], meta["Manufacturer"], meta["Modality"],
            meta["StationName"], meta["SeriesDate"], orthanc_id,
            float(jr["S_depth"]), float(jr["U_cov"]), float(jr["U_skew"]),
            json.dumps([float(x) for x in jr["U_low"]]),
            json.dumps(jr.get("horiz_profile", [])), json.dumps(jr.get("vert_profiles", [])),
            jr.get("transducer_name", ""),
            meta["ManufacturerModelName"], meta["StudyDate"], meta["ContentDate"],
            meta["DeviceSerialNumber"], meta["ContentTime"],
            float(processing_time), output_path, straightened,
        ),
    )
    conn.commit()
    IMAGES_PROCESSED.labels(modality="US", status="success").inc()   # metriikka: onnistui
    QA_RESULTS.labels(modality="US").inc()
    # QA-verdikti toleransseja vasten -> metriikka (QA-hälytyksen lähde)
    station = str(meta["StationName"]) or "Unknown"
    verdict = qa_verdict(jr)
    QA_VERDICT.labels(modality="US", station=station, verdict=verdict).inc()
    if verdict == "fail":
        logger.warning("⚠️ QA FAIL: station=%s instance=%s (U_cov=%s U_skew=%s)",
                       station, orthanc_id, jr.get("U_cov"), jr.get("U_skew"))
    set_status(cur, conn, job_id, "COMPLETED")
    logger.info("✅ Job %s (orthanc %s) COMPLETED in %.2fs (verdict=%s)", job_id, orthanc_id, processing_time, verdict)


def run():
    start_http_server(METRICS_PORT)
    logger.info("📈 Metriikat portissa %s", METRICS_PORT)
    logger.info("🚀 US event-driven worker '%s' käynnistyy (queue=%s)", WORKER_ID, QUEUE)

    conn = connect_db()
    cur = conn.cursor()
    ensure_columns(cur)
    conn.commit()

    global TOLERANCES
    TOLERANCES = load_tolerances(cur)
    logger.info("Ladattu %d US-toleranssia QA-verdiktille", len(TOLERANCES))

    while True:
        try:
            drain_doorbell(cur, conn)   # odota herätystä (tai timeout)
            TOLERANCES = load_tolerances(cur)  # pidä ajan tasalla (/rajat-muokkaukset)
            reclaim_stale(cur, conn)    # vapauta orvot varaukset
            # Tyhjennä kaikki jonossa odottavat jobit (useampi voi olla QUEUED)
            while True:
                job = claim_job(cur, conn)
                if not job:
                    break
                try:
                    process_job(cur, conn, job)
                except Exception as e:  # noqa: BLE001
                    logger.error("❌ Job %s FAILED: %s", job.get("id"), e)
                    IMAGES_PROCESSED.labels(modality="US", status="failed").inc()
                    try:
                        set_status(cur, conn, job["id"], "FAILED",
                                   error=f"{e}\n{traceback.format_exc()[:1500]}")
                    except Exception:  # noqa: BLE001
                        conn = connect_db(); cur = conn.cursor()  # yhteys rikki -> uusi
        except Exception as e:  # noqa: BLE001 — silmukka ei saa kuolla
            logger.error("Silmukkavirhe, jatketaan: %s", e)
            time.sleep(2)
            try:
                conn = connect_db(); cur = conn.cursor()
            except Exception:  # noqa: BLE001
                time.sleep(5)


if __name__ == "__main__":
    run()
