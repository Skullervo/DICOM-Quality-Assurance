"""Orthanc REST -client: study-rakenteen enumerointi (study -> series -> instances)."""
import logging
import requests

from ..config import settings, orthanc_auth

logger = logging.getLogger(__name__)
# Aikakatkaisu (sekunteina) jokaiselle Orthanc-HTTP-kutsulle, ettei jumiutunut
# Orthanc jätä ingestionia roikkumaan loputtomiin.
_TIMEOUT = 30


def _get(path: str):
    # Sisäinen apufunktio: tee GET-kutsu Orthancin REST-API:n polkuun ja palauta JSON.
    # raise_for_status heittää poikkeuksen jos vastaus on virhe (4xx/5xx),
    # jolloin koko ingestion epäonnistuu ja webhook palauttaa 502:n.
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
    # Hae study-resurssi ja sen Study-tason tunniste (StudyInstanceUID).
    study = get_study(study_id)
    study_tags = study.get("MainDicomTags", {})
    study_uid = study_tags.get("StudyInstanceUID", "")

    # Tuloslista per modaliteetti. Täytetään alla käymällä studyn sarjat läpi.
    out = {"study_instance_uid": study_uid, "us": [], "xray": [], "ct": [], "angio": []}

    # QA-suodatus: analysoidaan vain laadunvalvonta-/fantomistudyt. Orthanc sisältää myös
    # kliinisiä potilaskuvia (natiivit röntgenit, potilas-CT:t, kliininen angio), joille
    # QA-analyysi ei kuulu ajaa (ne vain kaatuisivat "phantom not detected" -virheeseen ja
    # turhaan kuormittaisivat). Tunnistus StudyDescriptionin avainsanoilla. Jos avainsanoja
    # ei ole asetettu (tyhjä), suodatus on pois päältä ja kaikki analysoidaan (vanha käytös).
    study_desc = (study_tags.get("StudyDescription") or "").lower()
    if settings.QA_STUDY_KEYWORDS and not any(k in study_desc for k in settings.QA_STUDY_KEYWORDS):
        logger.info(
            "Ohitetaan ei-QA-study %s (StudyDescription=%r) — ei luoda jobeja",
            study_id, study_tags.get("StudyDescription", ""),
        )
        return out  # tyhjä -> ingestion ei luo yhtään jobia tälle studylle

    # Käydään studyn jokainen sarja (series) läpi ja reititetään se modaliteetin mukaan.
    for series_id in study.get("Series", []):
        series = get_series(series_id)
        s_tags = series.get("MainDicomTags", {})
        # Modality ratkaisee mihin analyysiin sarja kuuluu. .upper() normalisoi (us->US).
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
            # XR (CR/DX): yksi job per SARJA (orthanc_id = sarjan id).
            out["xray"].append({
                "orthanc_id": series_id,
                "series_instance_uid": series_uid,
                "sop_instance_uid": "",
                "station_name": station,
                "modality": modality,
            })
        elif modality in settings.MODALITY_CT:
            # CT: yksi job per SARJA (orthanc_id = sarjan id); CT-analyysi käsittelee
            # koko fantomisarjan (Catphan-moduulit eri leikkeissä).
            out["ct"].append({
                "orthanc_id": series_id,
                "series_instance_uid": series_uid,
                "sop_instance_uid": "",
                "station_name": station,
                "modality": "CT",
            })
        elif modality in settings.MODALITY_ANGIO:
            # XA: yksi job per instanssi (kukin XA-kuva = yksi QA-mittaus, kuten US)
            for inst_id in series.get("Instances", []):
                tags = get_instance_tags(inst_id)
                out["angio"].append({
                    "orthanc_id": inst_id,
                    "series_instance_uid": series_uid,
                    "sop_instance_uid": tags.get("SOPInstanceUID", ""),
                    "station_name": station or tags.get("StationName", ""),
                    "modality": "XA",
                })
        # muut modaliteetit ohitetaan (esim. MR, PT) — niille ei ole QA-analyysiä

    return out
