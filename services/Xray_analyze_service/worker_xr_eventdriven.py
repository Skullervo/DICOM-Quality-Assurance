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
import json
import time
import tempfile
import logging

import requests
import pydicom

import s3_client
from worker_common import EventWorker, IMAGES_PROCESSED, QA_RESULTS
# TÄRKEÄ: 'import xray_analyze_service' suorittaa kyseisen moduulin ylätason koodin,
# joka SOVELTAA pakollisen pylinac 3.38 ROI-monkey-patchin JA asettaa matplotlibin
# Agg-tilaan. Tämä pitää tapahtua ENNEN Normi13:n käyttöä. Siksi worker käyttää
# tietoisesti pääpalvelun funktioita eikä toista logiikkaa.
import xray_analyze_service as xr
from xray_analyze_service import (
    extract_dicom_metadata, extract_analysis_results, insert_xray_analysis,
    _render_roi_map, _render_mtf_lp_image, _render_mtf_curve,
)

logger = logging.getLogger("xr_worker")

# Orthanc-osoite/-tunnukset. Event-worker hakee DICOMit SUORAAN Orthancin
# REST-rajapinnasta (ei Fetch-gRPC:tä kuten polleri).
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
_USER = os.getenv("ORTHANC_USERNAME", "admin")
_PASS = os.getenv("ORTHANC_PASSWORD", "")
AUTH = (_USER, _PASS) if _USER else None
XRAY_MODALITIES = ("CR", "DX")

# Idempotentti: varmista analysis_images-sarake (S3-kuva-avaimet JSONina). Aja kerran
# workerin elinaikana (ei joka jobilla). Vanhoilla riveillä sarake on NULL -> Go-backend
# putoaa takaisin VARBINARY-BLOB-lukupolkuun (kaksoisluku).
_schema_ready = False


def _ensure_schema(cur, conn):
    global _schema_ready
    if _schema_ready:
        return
    cur.execute("IF COL_LENGTH('dbo.xray_analysis','analysis_images') IS NULL "
                "ALTER TABLE dbo.xray_analysis ADD analysis_images NVARCHAR(MAX) NULL")
    conn.commit()
    _schema_ready = True


def _fetch(inst_id: str) -> bytes:
    # Hae yhden instanssin raaka DICOM-tiedosto Orthancista. raise_for_status
    # nostaa virheen HTTP-virhekoodilla -> process() merkitsee jobin FAILED.
    r = requests.get(f"{ORTHANC_URL}/instances/{inst_id}/file", auth=AUTH, timeout=120)
    r.raise_for_status()
    return r.content


def _analyze_instance(cur, conn, series_id, instance_id):
    """Analysoi yksi XR-instanssi. Palauttaa True jos tallennettiin/ohitettiin, nostaa virheen jos kaatui."""
    data = _fetch(instance_id)
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    # Itse-suodatus: analysoidaan vain CR/DX-kuvat; muut ohitetaan (True ei kasvateta).
    if str(ds.get("Modality", "")) not in XRAY_MODALITIES:
        return False  # ei XR -> ohita

    # Duplikaattitarkistus: jos instanssi on jo DB:ssä, pidetään onnistuneena.
    cur.execute("SELECT 1 FROM xray_analysis WHERE instance = %s", (instance_id,))
    if cur.fetchone():
        return True  # jo analysoitu

    # Normi13 vaatii tiedostopolun -> kirjoitetaan väliaikaistiedostoon.
    tmp = tempfile.NamedTemporaryFile(suffix=".dcm", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        # Sama NORMI-13-analyysi kuin pollerilla (xr.Normi13 = patchattu luokka).
        t0 = time.time()
        IQ = xr.Normi13(tmp.name, plot=False, debug=False, mtf_mode="relative")
        IQ.analyze(visibility_threshold=0.0025)
        results = IQ.results_data(as_dict=True)
        processing_time = time.time() - t0

        # Kuvarenderöinnit best-effort: pieni apufunktio _try nielaisee yhden
        # kuvan virheen (-> None), jotta muut kuvat ja tulokset silti tallentuvat.
        def _try(fn):
            try:
                return fn(IQ)
            except Exception as e:  # noqa: BLE001
                logger.warning("kuvarenderöinti epäonnistui: %s", e)
                return None
        cr, ml, mc = _try(_render_roi_map), _try(_render_mtf_lp_image), _try(_render_mtf_curve)

        # Poiminta + tallennus samoilla apufunktioilla kuin pollerilla.
        metadata = extract_dicom_metadata(ds)
        analysis = extract_analysis_results(results, IQ)

        # Analyysikuvat -> S3 (kuten US/angio): avain qa/xray/<series>/<instance>_<tyyppi>.png.
        # Go-backend lukee tyyppi->s3-polku -mapin analysis_images-sarakkeesta ja tarjoilee
        # kuvan S3:sta. Jos S3 ei vastaa, pudotaan BLOB-fallbackiin (nykyinen VARBINARY-polku).
        img_keys, use_s3 = {}, True
        try:
            for typ, data in (("contrast_rois", cr), ("mtf_lp", ml), ("mtf_curve", mc)):
                if data:
                    key = f"qa/xray/{series_id}/{instance_id}_{typ}.png"
                    img_keys[typ] = s3_client.upload_bytes(key, data, "image/png")
        except Exception as e:  # noqa: BLE001 — S3-virhe ei saa kaataa analyysiä
            logger.warning("XR S3-upload epäonnistui (%s) -> BLOB-fallback", e)
            use_s3 = False
        if use_s3:
            # Kuvat S3:ssa -> älä kirjoita BLOBeja (None); tallenna avaimet JSONiin.
            insert_xray_analysis(cur, instance_id, series_id, metadata, analysis, processing_time, None, None, None)
            cur.execute("UPDATE xray_analysis SET analysis_images=%s WHERE instance=%s",
                        (json.dumps(img_keys), instance_id))
        else:
            insert_xray_analysis(cur, instance_id, series_id, metadata, analysis, processing_time, cr, ml, mc)
        conn.commit()
        IMAGES_PROCESSED.labels(modality="CR", status="success").inc()
        QA_RESULTS.labels(modality="CR").inc()
        return True
    finally:
        # Siivoa väliaikaistiedosto aina.
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def process(wk, cur, conn, job):
    # Tämä on EventWorkerin kutsuma modaliteettikohtainen käsittelijä.
    # job.orthanc_id = XR-SARJAN id. Analyysi tehdään per instanssi (kuva).
    series_id = job["orthanc_id"]
    wk.set_status(cur, conn, job["id"], "RUNNING")
    _ensure_schema(cur, conn)   # varmista analysis_images-sarake (kerran)

    # Haetaan sarjan kaikki instanssit Orthancista.
    insts = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances", auth=AUTH, timeout=60).json()
    if not insts:
        raise RuntimeError("no instances in series")

    # Käydään instanssit läpi; lasketaan onnistuneet ja kerätään virheet.
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

    # Job katsotaan epäonnistuneeksi VAIN jos yksikään instanssi ei onnistunut ja
    # virheitä oli. Jos edes yksi onnistui (tai kaikki oli jo tehty), job COMPLETED.
    if done == 0 and errors:
        raise RuntimeError("; ".join(errors[:3]))
    wk.set_status(cur, conn, job["id"], "COMPLETED")
    logger.info("✅ XR job %s (series %s) COMPLETED (%d instanssia)", job["id"], series_id, done)


if __name__ == "__main__":
    # Käynnistä worker: modality="CR", kuuntele XRJobQueue-jonoa, totuustaulu
    # xray_jobs, käsittele process()-funktiolla. run() jää ikuiseen silmukkaan.
    EventWorker("CR", "XRJobQueue", "xray_jobs", process).run()
