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


# Yhden studyn käsittely kolmessa vaiheessa:
#   1) enumerate_study: hae Orthancista studyn sarjat/instanssit ja luokittele modaliteetin mukaan
#   2) create_jobs_for_study: kirjoita QUEUED-jobit job-tauluihin (duplikaatit ohitetaan)
#   3) lokita yhteenveto (montako luotiin per modaliteetti + montako oli jo olemassa)
# Tämä funktio ajetaan threadpoolissa (ks. alla), koska se tekee estäviä HTTP- ja DB-kutsuja.
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
    # Orthanc-plugin lähettää avaimen "resource_id"; sallitaan myös "study_id"
    # muiden kutsujien (esim. manuaalinen testi) varalta.
    study_id = payload.get("resource_id") or payload.get("study_id")
    # Ilman study-tunnistetta ei voida tehdä mitään -> 400 Bad Request.
    if not study_id:
        raise HTTPException(status_code=400, detail="missing resource_id/study_id")
    try:
        # Ajetaan estävä käsittely erillisessä säikeessä, jotta FastAPI:n
        # tapahtumasilmukka (event loop) ei jumiudu HTTP-/DB-odotuksen ajaksi.
        result = await run_in_threadpool(_ingest_study, study_id)
    except Exception as e:  # noqa: BLE001
        # Mikä tahansa virhe (Orthanc tavoittamattomissa, DB-virhe) -> 502 Bad Gateway.
        # Orthanc-plugin logittaa virheen eikä kaadu; Orthanc yrittää myöhemmin uudelleen.
        logger.exception("Ingestion epäonnistui studylle %s", study_id)
        raise HTTPException(status_code=502, detail=f"ingestion failed: {e}") from e
    # Onnistui: palautetaan luontitilastot kutsujalle (ja ne näkyvät myös logissa).
    return {"status": "ok", **result}
