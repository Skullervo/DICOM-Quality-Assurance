"""AutoQAD Angiography/fluoroscopy (XA) analysis worker — event-driven.

Leeds TOR-18 image-quality QA for XA (angiography) devices. Mirrors the XR/US
event-driven workers: Service Broker doorbell -> atomic claim from angio_jobs ->
fetch DICOM from Orthanc REST -> LeedsTOR analysis (tor18_analysis) -> overlay PNG
to S3 (like US) -> insert angio_analysis row.

Granularity: per INSTANCE (job.orthanc_id = Orthanc instance id; one XA image =
one QA measurement, like US). Self-filters by DICOM Modality == 'XA'.
"""
import io
import os
import time
import logging
import tempfile

import requests
import pydicom

from worker_common import EventWorker, IMAGES_PROCESSED
import s3_client
from tor18_analysis import analyze_dicom_bytes, extract_dicom_metadata, ANALYSIS_VERSION

logger = logging.getLogger("angio_worker")

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
_USER = os.getenv("ORTHANC_USERNAME", "admin")
_PASS = os.getenv("ORTHANC_PASSWORD", "")
AUTH = (_USER, _PASS) if _USER else None
ANGIO_MODALITIES = ("XA",)

INSERT_SQL = """
INSERT INTO angio_analysis (
    instance, series_id, institution_name, institutional_department_name,
    manufacturer, manufacturer_model_name, modality, station_name,
    device_serial_number, study_date, series_date, content_date, content_time,
    kvp, exposure_mas, distance_source_to_detector, imager_pixel_spacing,
    num_contrast_rois_seen, median_cnr, median_contrast,
    percent_integral_uniformity, mtf_50_percent, phantom_area,
    phantom_center_x, phantom_center_y,
    output_image_path, analysis_type, analysis_version, processing_time, processed_at
) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, SYSUTCDATETIME())
"""


def _fetch(inst_id: str) -> bytes:
    r = requests.get(f"{ORTHANC_URL}/instances/{inst_id}/file", auth=AUTH, timeout=120)
    r.raise_for_status()
    return r.content


def insert_angio_analysis(cur, instance_id, series_id, meta, metrics, center, s3_path, processing_time):
    cx, cy = (center or (None, None))
    cur.execute(INSERT_SQL, (
        instance_id, series_id,
        meta["institution_name"], meta["institutional_department_name"],
        meta["manufacturer"], meta["manufacturer_model_name"], meta["modality"], meta["station_name"],
        meta["device_serial_number"], meta["study_date"], meta["series_date"],
        meta["content_date"], meta["content_time"],
        meta["kvp"], meta["exposure_mas"], meta["distance_source_to_detector"], meta["imager_pixel_spacing"],
        metrics["num_contrast_rois_seen"], metrics["median_cnr"], metrics["median_contrast"],
        metrics["percent_integral_uniformity"], metrics["mtf_50_percent"], metrics["phantom_area"],
        cx, cy,
        s3_path, "Leeds", ANALYSIS_VERSION, float(processing_time),
    ))


def process(wk, cur, conn, job):
    instance_id = job["orthanc_id"]
    wk.set_status(cur, conn, job["id"], "RUNNING")

    data = _fetch(instance_id)
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    if str(ds.get("Modality", "")) not in ANGIO_MODALITIES:
        # Not XA -> nothing to do; complete the job so it does not retry forever.
        wk.set_status(cur, conn, job["id"], "COMPLETED")
        logger.info("Job %s: instance %s not XA (%s) — skipped", job["id"], instance_id, ds.get("Modality"))
        return

    cur.execute("SELECT 1 FROM angio_analysis WHERE instance = %s", (instance_id,))
    if cur.fetchone():
        wk.set_status(cur, conn, job["id"], "COMPLETED")
        logger.info("Job %s: instance %s already analyzed — skipped", job["id"], instance_id)
        return

    t0 = time.time()
    res = analyze_dicom_bytes(data)
    processing_time = time.time() - t0
    wk.observe_duration(processing_time)

    meta = extract_dicom_metadata(ds)
    series_id = str(ds.get("SeriesInstanceUID", "")) or job.get("study_instance_uid", "")

    # Upload overlay PNG to S3 (like US). Best-effort: S3 failure must not fail the job.
    study_key = job.get("study_instance_uid") or instance_id
    s3_path = ""
    if res.overlay_png:
        key = f"qa/angio/{study_key}/{instance_id}.png"
        try:
            s3_path = s3_client.upload_bytes(key, res.overlay_png, "image/png")
        except Exception as e:  # noqa: BLE001
            logger.warning("S3 upload failed (%s): %s", key, e)

    insert_angio_analysis(cur, instance_id, series_id, meta, res.metrics,
                          res.phantom_center, s3_path, processing_time)
    conn.commit()
    IMAGES_PROCESSED.labels(modality="XA", status="success").inc()
    wk.mark_success(cur, conn, job["id"])
    logger.info("✅ Angio job %s (instance %s) COMPLETED in %.2fs (rois_seen=%s, PIU=%.1f)",
                job["id"], instance_id, processing_time,
                res.metrics["num_contrast_rois_seen"], res.metrics["percent_integral_uniformity"] or -1)


if __name__ == "__main__":
    EventWorker("XA", "ANGIOJobQueue", "angio_jobs", process).run()
