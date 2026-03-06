import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Fetch_service')))

import grpc
from concurrent import futures
import xray_analyze_service_pb2
import xray_analyze_service_pb2_grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import psycopg2
import psycopg2.extras
import numpy as np
import io
import json
import glob as globmod
import tempfile
from pathlib import Path
import pydicom
from pydicom.errors import InvalidDicomError
from time import time as timer
import requests
import logging

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

# pylinac 3.38 muutti HighContrastDiskROI ja LowContrastDiskROI API:t —
# normi13_qa käyttää vanhaa (array, angle, roi_radius, dist, center, ...) -kutsutapaa.
# Korjaus: ohjataan vanhat __init__-kutsut käyttämään from_phantom_center()-laskentaa.
from pylinac.planar_imaging import (
    HighContrastDiskROI as _OrigHCROI,
    LowContrastDiskROI as _OrigLCROI,
)
from pylinac.core.geometry import Point as _Point


def _patch_roi_class(cls):
    """Luo yhteensopiva __init__ joka tunnistaa vanhan kutsutavan."""
    _orig_init = cls.__init__

    def _compat_init(self, array, *args, **kwargs):
        # Vanha API: (array, angle, roi_radius, dist_from_center, phantom_center, ...)
        # Tunnistus: 4+ positional arg ja 4. arg on Point/tuple (phantom_center)
        if len(args) >= 4 and isinstance(args[3], (_Point, tuple)):
            angle, roi_radius, dist_from_center, phantom_center = args[:4]
            center = cls._get_shifted_center(angle, dist_from_center, phantom_center)
            # Muut positional args → kwargs-muotoon
            remaining_positional = args[4:]
            if remaining_positional and 'contrast_threshold' not in kwargs:
                kwargs['contrast_threshold'] = remaining_positional[0]
            _orig_init(self, array=array, radius=roi_radius,
                       center=center, **kwargs)
        else:
            _orig_init(self, array, *args, **kwargs)

    cls.__init__ = _compat_init


_patch_roi_class(_OrigHCROI)
_patch_roi_class(_OrigLCROI)

from normi13_qa.normi13 import Normi13

# ── Kuvien generointi normi13_qa-analyysin jälkeen ──

def _render_roi_map(IQ):
    """Renderöi tumma ROI-kartta: kaikki ROI-alueet DICOM-kuvan päälle."""
    fig, ax = plt.subplots(figsize=(6, 6), facecolor='black')
    ax.imshow(IQ.dcm_img, cmap='gray')
    ax.set_facecolor('black')
    ax.axis('off')

    # Uniformiteetti-ROI:t (syaani)
    for roi in IQ.uniformity_rois.values():
        roi.plot2axes(ax, edgecolor='#00b4d8')

    # Korkean kontrastin ROI:t (vihreä) — ohita 'lps' (viivapari-ROI)
    for name, roi in IQ.high_contrast_rois.items():
        if name == 'lps':
            continue
        roi.plot2axes(ax, edgecolor='#4ade80')

    # Matalan kontrastin ROI:t (keltainen/näkyvyysväri)
    for roi in IQ.low_contrast_rois.values():
        roi.plot2axes(ax, edgecolor='#fbbf24')

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor='black',
                bbox_inches='tight', pad_inches=0, dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_mtf_lp_image(IQ):
    """Renderöi viivapari-alueen kuva tummalla taustalla ROI-merkinnöillä."""
    lps_roi = IQ.high_contrast_rois.get('lps')
    if lps_roi is None:
        return None

    # Rajaa viivapari-alue (sama logiikka kuin normi13_qa._estimate_mtf)
    x1 = max(0, int(lps_roi.center.x - lps_roi.diameter))
    x2 = min(IQ.dcm_img.shape[1], int(lps_roi.center.x + lps_roi.diameter))
    y1 = max(0, int(lps_roi.center.y - lps_roi.diameter))
    y2 = min(IQ.dcm_img.shape[0], int(lps_roi.center.y + lps_roi.diameter))
    lps_cropped = IQ.dcm_img[y1:y2, x1:x2]

    fig, ax = plt.subplots(figsize=(5, 5), facecolor='black')
    ax.imshow(lps_cropped, cmap='gray')
    ax.set_facecolor('black')
    ax.axis('off')

    # Piirrä viivapari-ROI:t (siirrettyinä rajauksen koordinaatteihin)
    for roi in IQ.line_pair_rois.values():
        cx = roi.center.x - x1
        cy = roi.center.y - y1
        circle = Circle((cx, cy), roi.radius,
                         fill=False, edgecolor='#38bdf8', linewidth=1.5)
        ax.add_patch(circle)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor='black',
                bbox_inches='tight', pad_inches=0, dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_mtf_curve(IQ):
    """Renderöi MTF-käyrä sivun dark-teemaan sopivalla tyylillä."""
    if not hasattr(IQ, 'mtf') or IQ.mtf is None:
        return None

    BG = '#0d1117'
    GRID = '#1e293b'
    TEXT = '#94a3b8'
    LINE = '#00b4d8'

    fig, ax = plt.subplots(figsize=(6, 3.5), facecolor=BG)
    ax.set_facecolor(BG)

    # Käytetään pylinacin MTF-olion plot-metodia
    IQ.mtf.plot(ax)

    # Päivitetään viivan väri
    for line in ax.get_lines():
        line.set_color(LINE)
        line.set_linewidth(2)

    # Tummennetaan akseli ja tekstit
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.tick_params(colors=TEXT, labelsize=8)
    ax.xaxis.label.set_color(TEXT)
    ax.yaxis.label.set_color(TEXT)
    if ax.get_title():
        ax.set_title(ax.get_title(), color=TEXT, fontsize=10)
    ax.grid(True, color=GRID, alpha=0.5, linewidth=0.5)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor=BG,
                bbox_inches='tight', pad_inches=0.3, dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# Lataa ympäristömuuttujat Djangon .env-tiedostosta (paikallinen ajo)
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), '..', '..', 'client', '.env')
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        logging.getLogger(__name__).info("Loaded .env from %s", _env_path)
except ImportError:
    pass

# Orthanc ja Fetch Service -osoitteet
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042")
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "localhost:50051")

# Natiiviröntgenin modaliteetit (CR = Computed Radiography, DX = Digital X-ray)
XRAY_MODALITIES = ("CR", "DX")

DB_CONFIG = {
    "dbname": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "postgres"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "host": os.getenv("DATABASE_HOST", "localhost"),
    "port": os.getenv("DATABASE_PORT", "5432"),
}

logger = logging.getLogger(__name__)


def connect_db():
    """Luo tietokantayhteys ja varmista, että xray_analysis-taulu on olemassa."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS xray_analysis (
            id SERIAL PRIMARY KEY,
            instance TEXT UNIQUE,
            series_id TEXT,
            processed_at TIMESTAMP DEFAULT NOW(),

            -- DICOM metadata
            content_date TEXT,
            content_time TEXT,
            device_serial_number TEXT,
            instance_number TEXT,
            institution_name TEXT,
            institutional_department_name TEXT,
            manufacturer TEXT,
            manufacturer_model_name TEXT,
            modality TEXT,
            patient_id TEXT,
            patient_name TEXT,
            station_name TEXT,
            series_date TEXT,
            study_date TEXT,

            -- X-ray kuvausparametrit
            kvp TEXT,
            exposure_time TEXT,
            tube_current TEXT,
            filter_type TEXT,
            grid_info TEXT,
            distance_source_to_detector TEXT,
            focal_spot TEXT,
            protocol_name TEXT,
            exposure_mAs TEXT,

            -- Uniformity
            uniformity_center FLOAT,
            uniformity_deviation FLOAT,
            bg_mean FLOAT,

            -- High contrast (Cu-kiila, 7 paksuutta, mean + std)
            cu_000_mean FLOAT,
            cu_030_mean FLOAT,
            cu_065_mean FLOAT,
            cu_100_mean FLOAT,
            cu_140_mean FLOAT,
            cu_185_mean FLOAT,
            cu_230_mean FLOAT,
            cu_000_std FLOAT,
            cu_030_std FLOAT,
            cu_065_std FLOAT,
            cu_100_std FLOAT,
            cu_140_std FLOAT,
            cu_185_std FLOAT,
            cu_230_std FLOAT,

            -- Low contrast (6 tasoa)
            lc_08_contrast FLOAT,
            lc_12_contrast FLOAT,
            lc_20_contrast FLOAT,
            lc_28_contrast FLOAT,
            lc_40_contrast FLOAT,
            lc_56_contrast FLOAT,
            low_contrast_details JSONB,

            -- Laatumetriikat
            median_contrast FLOAT,
            median_cnr FLOAT,
            mtf_50_percent FLOAT,
            num_contrast_rois_seen INTEGER,

            -- Phantom-geometria
            phantom_angle FLOAT,
            phantom_center_x FLOAT,
            phantom_center_y FLOAT,
            phantom_area FLOAT,
            side_length FLOAT,

            -- MTF-data (JSON)
            mtf_data JSONB,

            -- Analyysin metatiedot
            analysis_type TEXT,
            analysis_version TEXT,
            processing_time FLOAT,

            -- Analyysikuvat
            contrast_rois_image BYTEA,
            mtf_curve_image BYTEA
        )
    """)
    conn.commit()
    cur.close()
    return conn


def get_fetch_stub():
    """Yhdistetään Fetch Serviceen."""
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)


def extract_dicom_metadata(ds):
    """Poimi DICOM-metatiedot datasetistä."""
    def get_tag(tag_name, default=""):
        val = ds.get(tag_name, default)
        return str(val) if val else default

    return {
        "content_date": get_tag("ContentDate") or get_tag("AcquisitionDate"),
        "content_time": get_tag("ContentTime"),
        "device_serial_number": get_tag("DeviceSerialNumber"),
        "instance_number": get_tag("InstanceNumber"),
        "institution_name": get_tag("InstitutionName", "Unknown"),
        "institutional_department_name": get_tag("InstitutionalDepartmentName", "Unknown"),
        "manufacturer": get_tag("Manufacturer", "Unknown"),
        "manufacturer_model_name": get_tag("ManufacturerModelName"),
        "modality": get_tag("Modality", "Unknown"),
        "patient_id": get_tag("PatientID"),
        "patient_name": get_tag("PatientName"),
        "station_name": get_tag("StationName", "Unknown"),
        "series_date": get_tag("SeriesDate"),
        "study_date": get_tag("StudyDate"),
        "kvp": get_tag("KVP"),
        "exposure_time": get_tag("ExposureTime"),
        "tube_current": get_tag("XRayTubeCurrent"),
        "filter_type": get_tag("FilterType"),
        "grid_info": get_tag("Grid"),
        "distance_source_to_detector": get_tag("DistanceSourceToDetector"),
        "focal_spot": get_tag("FocalSpots"),
        "protocol_name": get_tag("ProtocolName"),
        "exposure_mAs": get_tag("Exposure"),
    }


def extract_analysis_results(results, IQ=None):
    """Mapaa normi13_qa:n analyysitulokset tietokantakenttiin.

    results = IQ.results_data(as_dict=True) palauttaa PlanarResult-dictionaryn.
    IQ = Normi13-olio, josta saadaan Cu std -arvot ja muut attribuutit.
    """
    def safe_float(val, default=None):
        if val is None:
            return default
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    # Poimi perusmetriikat
    data = {
        "median_contrast": safe_float(results.get("median_contrast")),
        "median_cnr": safe_float(results.get("median_cnr")),
        "num_contrast_rois_seen": results.get("num_contrast_rois_seen"),
        "phantom_area": safe_float(results.get("phantom_area")),
        "analysis_type": results.get("analysis_type", "Normi13"),
    }

    # Phantom-keskipiste (tuple tai lista)
    center = results.get("phantom_center_x_y")
    if center and len(center) >= 2:
        data["phantom_center_x"] = safe_float(center[0])
        data["phantom_center_y"] = safe_float(center[1])

    # MTF-data (avaimet ovat merkkijonoja, esim. "50")
    mtf = results.get("mtf_lp_mm")
    if mtf:
        data["mtf_data"] = json.dumps(mtf)
        data["mtf_50_percent"] = safe_float(mtf.get("50") or mtf.get(50))

    # Low-contrast ROI:t
    lc_rois = results.get("low_contrast_rois", [])
    lc_contrasts = {}
    lc_field_map = {
        0: "lc_08_contrast",
        1: "lc_12_contrast",
        2: "lc_20_contrast",
        3: "lc_28_contrast",
        4: "lc_40_contrast",
        5: "lc_56_contrast",
    }
    lc_name_map = {
        0: "lc_08",
        1: "lc_12",
        2: "lc_20",
        3: "lc_28",
        4: "lc_40",
        5: "lc_56",
    }
    lc_details = []
    for idx, roi in enumerate(lc_rois):
        if idx in lc_field_map and isinstance(roi, dict):
            lc_contrasts[lc_field_map[idx]] = safe_float(roi.get("contrast"))
            lc_details.append({
                "name": lc_name_map.get(idx, f"lc_{idx}"),
                "contrast": safe_float(roi.get("contrast")),
                "cnr": safe_float(roi.get("cnr")),
                "snr": safe_float(roi.get("signal to noise")),
                "visibility": safe_float(roi.get("visibility")),
                "passed": roi.get("passed visibility", False),
            })
    data.update(lc_contrasts)
    if lc_details:
        data["low_contrast_details"] = json.dumps(lc_details)

    # IQ-oliosta poimitaan uniformiteetti, Cu mean+std
    if IQ is not None:
        # Uniformiteetti: lasketaan PIU (Percent Integral Uniformity)
        u_rois = getattr(IQ, "uniformity_rois", None)
        if u_rois and isinstance(u_rois, dict):
            u_means = [safe_float(getattr(r, "mean", None))
                       for r in u_rois.values()
                       if getattr(r, "mean", None) is not None]
            if u_means:
                u_max = max(u_means)
                u_min = min(u_means)
                if u_max + u_min > 0:
                    piu = 100.0 * (1.0 - (u_max - u_min) / (u_max + u_min))
                    data["uniformity_center"] = round(piu, 2)
                    data["uniformity_deviation"] = round(u_max - u_min, 2)
                # Keskimmäisen ROI:n mean → bg_mean
                center_roi = u_rois.get("u_center")
                if center_roi is not None:
                    data["bg_mean"] = safe_float(getattr(center_roi, "mean", None))

        # Cu-kiilan mean+std -arvot
        hc_rois = getattr(IQ, "high_contrast_rois", None)
        if hc_rois and isinstance(hc_rois, dict):
            for cu_name in ["cu_000", "cu_030", "cu_065", "cu_100",
                            "cu_140", "cu_185", "cu_230"]:
                roi = hc_rois.get(cu_name)
                if roi is not None:
                    mean_val = getattr(roi, "mean", None)
                    std_val = getattr(roi, "std", None)
                    data[f"{cu_name}_mean"] = safe_float(mean_val)
                    data[f"{cu_name}_std"] = safe_float(std_val)

    return data


def insert_xray_analysis(cur, instance_id, series_id, metadata, analysis,
                         processing_time, contrast_rois_bytes=None,
                         mtf_lp_bytes=None, mtf_curve_bytes=None):
    """Tallenna analyysitulokset xray_analysis-tauluun."""
    cur.execute("""
        INSERT INTO xray_analysis (
            instance, series_id, content_date, content_time, device_serial_number,
            instance_number, institution_name, institutional_department_name,
            manufacturer, manufacturer_model_name, modality, patient_id, patient_name,
            station_name, series_date, study_date,
            kvp, exposure_time, tube_current, filter_type, grid_info,
            distance_source_to_detector, focal_spot, protocol_name, "exposure_mAs",
            uniformity_center, uniformity_deviation, bg_mean,
            cu_000_mean, cu_030_mean, cu_065_mean, cu_100_mean,
            cu_140_mean, cu_185_mean, cu_230_mean,
            cu_000_std, cu_030_std, cu_065_std, cu_100_std,
            cu_140_std, cu_185_std, cu_230_std,
            lc_08_contrast, lc_12_contrast, lc_20_contrast,
            lc_28_contrast, lc_40_contrast, lc_56_contrast,
            low_contrast_details,
            median_contrast, median_cnr, mtf_50_percent, num_contrast_rois_seen,
            phantom_angle, phantom_center_x, phantom_center_y,
            phantom_area, side_length, mtf_data,
            analysis_type, analysis_version, processing_time,
            contrast_rois_image, mtf_lp_image, mtf_curve_image
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s
        )
    """, (
        instance_id, series_id,
        metadata["content_date"], metadata["content_time"],
        metadata["device_serial_number"], metadata["instance_number"],
        metadata["institution_name"], metadata["institutional_department_name"],
        metadata["manufacturer"], metadata["manufacturer_model_name"],
        metadata["modality"], metadata["patient_id"], metadata["patient_name"],
        metadata["station_name"], metadata["series_date"], metadata["study_date"],
        metadata["kvp"], metadata["exposure_time"], metadata["tube_current"],
        metadata["filter_type"], metadata["grid_info"],
        metadata["distance_source_to_detector"], metadata["focal_spot"],
        metadata["protocol_name"], metadata["exposure_mAs"],
        analysis.get("uniformity_center"),
        analysis.get("uniformity_deviation"),
        analysis.get("bg_mean"),
        analysis.get("cu_000_mean"), analysis.get("cu_030_mean"),
        analysis.get("cu_065_mean"), analysis.get("cu_100_mean"),
        analysis.get("cu_140_mean"), analysis.get("cu_185_mean"),
        analysis.get("cu_230_mean"),
        analysis.get("cu_000_std"), analysis.get("cu_030_std"),
        analysis.get("cu_065_std"), analysis.get("cu_100_std"),
        analysis.get("cu_140_std"), analysis.get("cu_185_std"),
        analysis.get("cu_230_std"),
        analysis.get("lc_08_contrast"), analysis.get("lc_12_contrast"),
        analysis.get("lc_20_contrast"), analysis.get("lc_28_contrast"),
        analysis.get("lc_40_contrast"), analysis.get("lc_56_contrast"),
        analysis.get("low_contrast_details"),
        analysis.get("median_contrast"), analysis.get("median_cnr"),
        analysis.get("mtf_50_percent"), analysis.get("num_contrast_rois_seen"),
        analysis.get("phantom_angle"),
        analysis.get("phantom_center_x"), analysis.get("phantom_center_y"),
        analysis.get("phantom_area"), analysis.get("side_length"),
        analysis.get("mtf_data"),
        analysis.get("analysis_type", "Normi13"),
        analysis.get("analysis_version", "0.1"),
        processing_time,
        psycopg2.Binary(contrast_rois_bytes) if contrast_rois_bytes else None,
        psycopg2.Binary(mtf_lp_bytes) if mtf_lp_bytes else None,
        psycopg2.Binary(mtf_curve_bytes) if mtf_curve_bytes else None,
    ))


class XrayAnalyzeService(xray_analyze_service_pb2_grpc.XrayAnalyzeServiceServicer):
    def AnalyzeAllDicomData(self, request, context):
        logger.info("Received request to analyze all X-ray series in Orthanc")

        # Haetaan kaikki sarjat Orthancista
        response = requests.get(f"{ORTHANC_URL}/series")
        if response.status_code != 200:
            logger.error("Error: Could not fetch series from Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return xray_analyze_service_pb2.AnalyzeResponse(
                message="No series found", series_id="ALL"
            )

        series_list = response.json()
        if not series_list:
            logger.warning("No series found in Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return xray_analyze_service_pb2.AnalyzeResponse(
                message="No series available", series_id="ALL"
            )

        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()
        analyzed_count = 0

        for series_id in series_list:
            logger.info("Processing series ID: %s", series_id)

            # Haetaan sarjan instanssit Orthancista
            instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances")
            if instance_response.status_code != 200:
                logger.error("Could not fetch instances for series %s", series_id)
                continue

            instance_list = instance_response.json()
            if not instance_list:
                logger.warning("No instances found for series %s", series_id)
                continue

            for instance in instance_list:
                instance_id = instance["ID"]
                logger.info("Fetching instance ID: %s", instance_id)

                # Haetaan DICOM-data Fetch-palvelulta
                try:
                    fetch_response = fetch_stub.FetchDicomData(
                        fetch_service_pb2.FetchRequest(instance_id=instance_id)
                    )
                except grpc.RpcError as e:
                    logger.error("gRPC error fetching instance %s: %s", instance_id, e)
                    continue

                if not fetch_response.dicom_data:
                    logger.warning("No data received for instance %s", instance_id)
                    continue

                # Muutetaan binääridata DICOM-muotoon
                dicom_bytes = fetch_response.dicom_data
                try:
                    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), force=True)
                    logger.info("DICOM data successfully read!")
                except InvalidDicomError as e:
                    logger.error("Error reading DICOM file: %s", e)
                    continue

                # Tarkistetaan modaliteetti
                modality = str(ds.get("Modality", ""))
                if modality not in XRAY_MODALITIES:
                    logger.info("Not an X-ray image (modality=%s). Skipping instance %s",
                                modality, instance_id)
                    continue

                # Tallennetaan väliaikaistiedostoon (Normi13 vaatii tiedostopolun)
                tmp_path = None
                contrast_rois_bytes = None
                mtf_lp_bytes = None
                mtf_curve_bytes = None
                try:
                    with tempfile.NamedTemporaryFile(suffix='.dcm', delete=False) as tmp:
                        tmp.write(dicom_bytes)
                        tmp_path = tmp.name

                    # Analysoidaan normi13_qa:lla (plot=False — generoidaan kuvat itse)
                    start_time = timer()
                    IQ = Normi13(tmp_path, plot=False, debug=False,
                                 mtf_mode='relative')
                    IQ.analyze(visibility_threshold=0.0025)
                    results = IQ.results_data(as_dict=True)
                    processing_time = timer() - start_time

                    # Generoidaan kuvat IQ-oliosta
                    try:
                        contrast_rois_bytes = _render_roi_map(IQ)
                    except Exception as e:
                        logger.warning("ROI map generation failed: %s", e)
                    try:
                        mtf_lp_bytes = _render_mtf_lp_image(IQ)
                    except Exception as e:
                        logger.warning("MTF LP image generation failed: %s", e)
                    try:
                        mtf_curve_bytes = _render_mtf_curve(IQ)
                    except Exception as e:
                        logger.warning("MTF curve generation failed: %s", e)

                    logger.info("Analysis complete for instance %s (%.1f s, rois=%s, lp=%s, mtf=%s)",
                                instance_id, processing_time,
                                "yes" if contrast_rois_bytes else "no",
                                "yes" if mtf_lp_bytes else "no",
                                "yes" if mtf_curve_bytes else "no")

                except Exception as e:
                    logger.error("Analysis failed for instance %s: %s", instance_id, e)
                    continue
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        os.unlink(tmp_path)

                # Poimitaan DICOM-metatiedot
                metadata = extract_dicom_metadata(ds)

                # Mapataaan analyysitulokset (IQ-olio mukaan Cu std:n poimintaa varten)
                analysis = extract_analysis_results(results, IQ)

                # Tallennetaan tietokantaan
                try:
                    insert_xray_analysis(
                        cur, instance_id, series_id, metadata, analysis,
                        processing_time, contrast_rois_bytes, mtf_lp_bytes, mtf_curve_bytes
                    )
                    analyzed_count += 1
                except psycopg2.IntegrityError:
                    conn.rollback()
                    logger.info("Instance %s already in database, skipping.", instance_id)
                    continue

        conn.commit()
        cur.close()
        conn.close()

        msg = f"X-ray analysis complete! {analyzed_count} instances analyzed."
        logger.info(msg)
        return xray_analyze_service_pb2.AnalyzeResponse(message=msg, series_id="ALL")

    def AnalyzeDicomData(self, request, context):
        logger.info("Single series analysis not yet implemented for X-ray")
        return xray_analyze_service_pb2.AnalyzeResponse(
            message="Not implemented", series_id=request.series_id
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    xray_analyze_service_pb2_grpc.add_XrayAnalyzeServiceServicer_to_server(
        XrayAnalyzeService(), server
    )
    server.add_insecure_port("[::]:50053")
    server.start()
    logger.info("X-ray Analyze Service running on port 50053")
    server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    serve()
