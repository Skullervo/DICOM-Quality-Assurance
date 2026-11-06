"""AutoQAD CT analysis worker — event-driven (manuscript §2.2.4).

Korvaa pollaus/claim-mallin tapahtumapohjaisella. Ajetaan rinnalle; cutover vasta
kun testattu. Uudelleenkäyttää ct_analyze_service:n + analyzerien logiikan.

Virta per CT-SARJA (job.orthanc_id = Orthanc series id):
  RECEIVE (CTJobQueue) -> claim ct_jobs -> hae sarjan viipaleet Orthanc RESTillä
  -> CatPhan (auto-detect -> partial -> Siemens-fallback) -> insert_ct_analysis
  -> job COMPLETED | FAILED

Tulokset + analyysikuvat (VARBINARY) tallentuvat ct_analysis-tauluun kuten ennen
(sama Go-backend-lukupolku). DICOM haetaan Orthanc RESTillä (ei Fetch-gRPC:tä).
"""
import io
import os
import json
import time
import shutil
import tempfile
import logging

import requests
import pydicom

import s3_client
from worker_common import EventWorker, IMAGES_PROCESSED, QA_RESULTS  # noqa: F401
# ct_analyze_service tuo matplotlib Agg + analyzerit; funktiot uudelleenkäyttöön
from ct_analyze_service import extract_ct_metadata, detect_phantom_type, insert_ct_analysis
from catphan_analyzer import CatphanAnalyzer
from siemens_analyzer import SiemensCTAnalyzer

logger = logging.getLogger("ct_worker")

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
_USER = os.getenv("ORTHANC_USERNAME", "admin")
_PASS = os.getenv("ORTHANC_PASSWORD", "")
AUTH = (_USER, _PASS) if _USER else None

# Idempotentti: varmista analysis_images-sarake (S3-kuva-avaimet JSONina). Aja kerran
# workerin elinaikana. Vanhoilla riveillä NULL -> Go-backend lukee VARBINARY-BLOBin.
_schema_ready = False


def _ensure_schema(cur, conn):
    global _schema_ready
    if _schema_ready:
        return
    cur.execute("IF COL_LENGTH('dbo.ct_analysis','analysis_images') IS NULL "
                "ALTER TABLE dbo.ct_analysis ADD analysis_images NVARCHAR(MAX) NULL")
    # hu_roi_map: insert_ct_analysis kirjoittaa tämän (CTP404 HU-ROI-kartta JSONina),
    # mutta schema_mssql.sql:n CREATE TABLE ei luonut sitä -> ilman tätä KAIKKI CT-insertit
    # kaatuvat "Invalid column name 'hu_roi_map'". Idempotentti lisäys.
    cur.execute("IF COL_LENGTH('dbo.ct_analysis','hu_roi_map') IS NULL "
                "ALTER TABLE dbo.ct_analysis ADD hu_roi_map NVARCHAR(MAX) NULL")
    # hu_linearity_clean_image: myös insert_ct_analysis:n kirjoittama BLOB-sarake jota
    # schema ei luonut (sama skeema-ajautuma kuin hu_roi_map).
    cur.execute("IF COL_LENGTH('dbo.ct_analysis','hu_linearity_clean_image') IS NULL "
                "ALTER TABLE dbo.ct_analysis ADD hu_linearity_clean_image VARBINARY(MAX) NULL")
    conn.commit()
    _schema_ready = True


def _fetch(inst_id: str) -> bytes:
    # Hae yhden DICOM-instanssin (leikkeen) raakatiedosto Orthancin REST-API:sta.
    r = requests.get(f"{ORTHANC_URL}/instances/{inst_id}/file", auth=AUTH, timeout=120)
    r.raise_for_status()
    return r.content


def process(wk, cur, conn, job):
    # CT-analyysi tehdään per SARJA (koko CatPhan-skannaus = monta leikettä).
    series_id = job["orthanc_id"]
    instance_key = f"{series_id}_0"  # avain ct_analysis-tauluun (sarja + leikeindeksi)
    wk.set_status(cur, conn, job["id"], "RUNNING")
    _ensure_schema(cur, conn)   # varmista analysis_images-sarake (kerran)

    # Hae sarjan kaikkien leikkeiden lista Orthancista.
    insts = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances", auth=AUTH, timeout=60).json()
    if not insts:
        raise RuntimeError("no instances in series")

    # pylinac/CatPhan tarvitsee leikkeet levyllä kansiossa -> lataa ne väliaikaiskansioon.
    temp_dir = tempfile.mkdtemp(prefix="ct_analysis_")
    try:
        first_ds = None
        for idx, inst in enumerate(insts):
            data = _fetch(inst["ID"])
            with open(os.path.join(temp_dir, f"slice_{idx:04d}.dcm"), "wb") as f:
                f.write(data)
            # Lue ensimmäisestä leikkeestä metadata ja varmista että kyseessä on CT.
            if idx == 0:
                first_ds = pydicom.dcmread(io.BytesIO(data), force=True)
                if str(first_ds.get("Modality", "")).upper() != "CT":
                    raise RuntimeError(f"not CT modality: {first_ds.get('Modality')}")

        metadata = extract_ct_metadata(first_ds)
        # Tunnista fantomityyppi (CatPhan504/600 vai Siemens) leikekansion perusteella.
        phantom_type = detect_phantom_type(temp_dir)

        t0 = time.time()
        images = {}
        # Kolmiportainen analyysi: (1) autodetektoitu CatPhan -> (2) partial-module-retry
        # CatphanAnalyzerin sisällä -> (3) Siemens-fallback jos CatPhan kaatuu kokonaan.
        if phantom_type == "SiemensCT":
            analysis = SiemensCTAnalyzer(temp_dir).analyze()
            analysis["phantom_model"] = "SiemensCT"
            analysis["analysis_type"] = "SiemensCT"
        else:
            try:
                # CatphanAnalyzer hoitaa sisäisesti partial-module-retryn (tier 2)
                analyzer = CatphanAnalyzer(temp_dir, phantom_model=phantom_type)
                result = analyzer.analyze()
                analysis = CatphanAnalyzer.extract_metrics(result["results"])
                analysis["phantom_model"] = analyzer.phantom_model
                analysis["analysis_type"] = "CatPhan"
                analysis["hu_roi_map"] = json.dumps(result.get("hu_roi_map", []))
                images = result.get("images", {})
            except Exception as ce:  # noqa: BLE001 — tier 3 Siemens-fallback
                logger.warning("CatPhan epäonnistui (%s) -> Siemens-fallback", ce)
                analysis = SiemensCTAnalyzer(temp_dir).analyze()
                analysis["phantom_model"] = "BasicCT"
                analysis["analysis_type"] = "BasicCT"

        processing_time = time.time() - t0
        wk.observe_duration(processing_time)
        analysis["num_images"] = len(insts)

        # Analyysikuvat -> S3 (kuten US/angio): avain qa/ct/<series>/<instance>_<tyyppi>.png.
        # analysis_images-sarakkeeseen tyyppi->s3-polku -mappi (tyypit vastaavat Go:n
        # CTAnalysisImage-validFieldsejä). S3-virhe -> BLOB-fallback (VARBINARY-polku).
        img_keys, use_s3 = {}, True
        try:
            for typ, data in images.items():
                if data:
                    key = f"qa/ct/{series_id}/{instance_key}_{typ}.png"
                    img_keys[typ] = s3_client.upload_bytes(key, data, "image/png")
        except Exception as e:  # noqa: BLE001 — S3-virhe ei saa kaataa analyysiä
            logger.warning("CT S3-upload epäonnistui (%s) -> BLOB-fallback", e)
            use_s3 = False
        if use_s3:
            # Kuvat S3:ssa -> älä kirjoita BLOBeja (tyhjä images); tallenna avaimet JSONiin.
            insert_ct_analysis(cur, instance_key, series_id, metadata, analysis, processing_time, {})
            cur.execute("UPDATE ct_analysis SET analysis_images=%s WHERE instance=%s",
                        (json.dumps(img_keys), instance_key))
        else:
            insert_ct_analysis(cur, instance_key, series_id, metadata, analysis, processing_time, images)
        conn.commit()
        wk.mark_success(cur, conn, job["id"])
        logger.info("✅ CT job %s (series %s) COMPLETED in %.2fs", job["id"], series_id, processing_time)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    EventWorker("CT", "CTJobQueue", "ct_jobs", process).run()
