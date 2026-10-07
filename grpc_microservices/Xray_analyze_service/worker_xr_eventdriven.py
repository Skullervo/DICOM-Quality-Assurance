"""AutoQAD X-ray analysis worker — event-driven (manuscript §2.2.4).

Korvaa pollaus/claim-mallin. Ajetaan rinnalle; cutover vasta kun testattu.
Uudelleenkäyttää xray_analyze_service:n logiikan — HUOM: moduulin import soveltaa
pakollisen pylinac 3.38 ROI-monkey-patchin + matplotlib Agg:n ennen Normi13:a.

Virta per XR-SARJA (job.orthanc_id = Orthanc series id). NORMI-13-analyysi tehdään
per INSTANSSI (yksi xray_analysis-rivi / instanssi, kuten pollerilla); sarjassa voi
olla useampi kuva. Job COMPLETED jos ≥1 instanssi onnistui tai kaikki jo tehty.
Analyysikuvat (VARBINARY) tallentuvat xray_analysis-tauluun kuten ennen.
"""
import io
import os
import time
import tempfile
import logging

import requests
import pydicom

from worker_common import EventWorker, IMAGES_PROCESSED, QA_RESULTS
# Import soveltaa pylinac-monkey-patchin + matplotlib Agg:n (pakollinen ennen Normi13:a)
import xray_analyze_service as xr
from xray_analyze_service import (
    extract_dicom_metadata, extract_analysis_results, insert_xray_analysis,
    _render_roi_map, _render_mtf_lp_image, _render_mtf_curve,
)

logger = logging.getLogger("xr_worker")

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
_USER = os.getenv("ORTHANC_USERNAME", "admin")
_PASS = os.getenv("ORTHANC_PASSWORD", "")
AUTH = (_USER, _PASS) if _USER else None
XRAY_MODALITIES = ("CR", "DX")


def _fetch(inst_id: str) -> bytes:
    r = requests.get(f"{ORTHANC_URL}/instances/{inst_id}/file", auth=AUTH, timeout=120)
    r.raise_for_status()
    return r.content


def _analyze_instance(cur, conn, series_id, instance_id):
    """Analysoi yksi XR-instanssi. Palauttaa True jos tallennettiin/ohitettiin, nostaa virheen jos kaatui."""
    data = _fetch(instance_id)
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    if str(ds.get("Modality", "")) not in XRAY_MODALITIES:
        return False  # ei XR -> ohita

    cur.execute("SELECT 1 FROM xray_analysis WHERE instance = %s", (instance_id,))
    if cur.fetchone():
        return True  # jo analysoitu

    tmp = tempfile.NamedTemporaryFile(suffix=".dcm", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        t0 = time.time()
        IQ = xr.Normi13(tmp.name, plot=False, debug=False, mtf_mode="relative")
        IQ.analyze(visibility_threshold=0.0025)
        results = IQ.results_data(as_dict=True)
        processing_time = time.time() - t0

        # Kuvarenderöinnit best-effort (yksittäinen epäonnistuminen -> None)
        def _try(fn):
            try:
                return fn(IQ)
            except Exception as e:  # noqa: BLE001
                logger.warning("kuvarenderöinti epäonnistui: %s", e)
                return None
        cr, ml, mc = _try(_render_roi_map), _try(_render_mtf_lp_image), _try(_render_mtf_curve)

        metadata = extract_dicom_metadata(ds)
        analysis = extract_analysis_results(results, IQ)
        insert_xray_analysis(cur, instance_id, series_id, metadata, analysis, processing_time, cr, ml, mc)
        conn.commit()
        IMAGES_PROCESSED.labels(modality="CR", status="success").inc()
        QA_RESULTS.labels(modality="CR").inc()
        return True
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def process(wk, cur, conn, job):
    series_id = job["orthanc_id"]
    wk.set_status(cur, conn, job["id"], "RUNNING")

    insts = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances", auth=AUTH, timeout=60).json()
    if not insts:
        raise RuntimeError("no instances in series")

    done, errors = 0, []
    for inst in insts:
        iid = inst["ID"]
        try:
            if _analyze_instance(cur, conn, series_id, iid):
                done += 1
        except Exception as e:  # noqa: BLE001 — per-instanssi, ei kaada koko jobia
            IMAGES_PROCESSED.labels(modality="CR", status="failed").inc()
            errors.append(f"{iid[:12]}: {e}")
            logger.error("XR instanssi %s epäonnistui: %s", iid, e)

    if done == 0 and errors:
        raise RuntimeError("; ".join(errors[:3]))
    wk.set_status(cur, conn, job["id"], "COMPLETED")
    logger.info("✅ XR job %s (series %s) COMPLETED (%d instanssia)", job["id"], series_id, done)


if __name__ == "__main__":
    EventWorker("CR", "XRJobQueue", "xray_jobs", process).run()
