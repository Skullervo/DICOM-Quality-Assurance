"""Orthanc REST -client: study-rakenteen enumerointi (study -> series -> instances)."""
import logging
import requests

from ..config import settings, orthanc_auth

logger = logging.getLogger(__name__)
_TIMEOUT = 30


def _get(path: str):
    url = f"{settings.ORTHANC_URL}{path}"
    r = requests.get(url, auth=orthanc_auth(), timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


def get_study(study_id: str) -> dict:
    """Study-resurssi: sisältää Series-listan + MainDicomTags + PatientMainDicomTags."""
    return _get(f"/studies/{study_id}")


def get_series(series_id: str) -> dict:
    """Series-resurssi: Instances-lista + MainDicomTags (Modality, SeriesInstanceUID...)."""
    return _get(f"/series/{series_id}")


def get_instance_tags(instance_id: str) -> dict:
    """Instanssin yksinkertaistetut DICOM-tagit (SOPInstanceUID, Modality, StationName...)."""
    try:
        return _get(f"/instances/{instance_id}/simplified-tags")
    except requests.RequestException as e:
        logger.warning("simplified-tags haku epäonnistui instanssille %s: %s", instance_id, e)
        return {}


def enumerate_study(study_id: str) -> dict:
    """Pura study analysoitaviksi yksiköiksi per modaliteetti.

    Palauttaa:
      {
        "study_instance_uid": str,
        "us":   [ {orthanc_id(instanssi), series_uid, sop_uid, station, modality} ... ],
        "xray": [ {orthanc_id(sarja), series_uid, station, modality} ... ],
        "ct":   [ {orthanc_id(sarja), series_uid, station, modality} ... ],
      }
    """
    study = get_study(study_id)
    study_tags = study.get("MainDicomTags", {})
    study_uid = study_tags.get("StudyInstanceUID", "")

    out = {"study_instance_uid": study_uid, "us": [], "xray": [], "ct": []}

    for series_id in study.get("Series", []):
        series = get_series(series_id)
        s_tags = series.get("MainDicomTags", {})
        modality = (s_tags.get("Modality") or "").upper()
        series_uid = s_tags.get("SeriesInstanceUID", "")
        station = s_tags.get("StationName", "")

        if modality in settings.MODALITY_US:
            # US: yksi job per instanssi (kukin instanssi = yksi QA-mittaus)
            for inst_id in series.get("Instances", []):
                tags = get_instance_tags(inst_id)
                out["us"].append({
                    "orthanc_id": inst_id,
                    "series_instance_uid": series_uid,
                    "sop_instance_uid": tags.get("SOPInstanceUID", ""),
                    "station_name": station or tags.get("StationName", ""),
                    "modality": "US",
                })
        elif modality in settings.MODALITY_XR:
            out["xray"].append({
                "orthanc_id": series_id,
                "series_instance_uid": series_uid,
                "sop_instance_uid": "",
                "station_name": station,
                "modality": modality,
            })
        elif modality in settings.MODALITY_CT:
            out["ct"].append({
                "orthanc_id": series_id,
                "series_instance_uid": series_uid,
                "sop_instance_uid": "",
                "station_name": station,
                "modality": "CT",
            })
        # muut modaliteetit ohitetaan

    return out
