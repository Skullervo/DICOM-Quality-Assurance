"""Webhook-endpointit: Orthancin muutostapahtuma -> QA-jobit.

Orthanc-plugin (ks. orthanc/autoqad_ingest.py) POSTaa tänne kun study on
vakaa (StableStudy). Enumeroimme studyn Orthancin REST-API:n kautta ja luomme
QUEUED-jobit kullekin analysoitavalle yksikölle.
"""
import logging
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..services import orthanc, database

logger = logging.getLogger(__name__)
router = APIRouter()


def _ingest_study(study_id: str) -> dict:
    enumerated = orthanc.enumerate_study(study_id)
    counts = database.create_jobs_for_study(enumerated)
    logger.info(
        "Study %s (uid=%s): luotiin %d jobia (US=%d XR=%d CT=%d), %d duplikaattia",
        study_id, enumerated.get("study_instance_uid", ""), counts["created"],
        counts["by_modality"]["us"], counts["by_modality"]["xray"],
        counts["by_modality"]["ct"], counts["duplicate"],
    )
    return {"study_id": study_id, **counts}


@router.post("/webhook/study")
async def receive_study_webhook(payload: dict):
    """Vastaanota study-tapahtuma. Hyväksyy sekä {resource_id} että {study_id}."""
    study_id = payload.get("resource_id") or payload.get("study_id")
    if not study_id:
        raise HTTPException(status_code=400, detail="missing resource_id/study_id")
    try:
        result = await run_in_threadpool(_ingest_study, study_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("Ingestion epäonnistui studylle %s", study_id)
        raise HTTPException(status_code=502, detail=f"ingestion failed: {e}") from e
    return {"status": "ok", **result}
