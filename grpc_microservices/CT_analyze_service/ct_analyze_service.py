import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Fetch_service')))

import grpc
from concurrent import futures
import ct_analyze_service_pb2
import ct_analyze_service_pb2_grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import psycopg2
import psycopg2.extras
import numpy as np
import io
import json
import tempfile
import shutil
from pathlib import Path
import pydicom
from pydicom.errors import InvalidDicomError
from time import time as timer
import requests
import logging

from catphan_analyzer import CatphanAnalyzer
from siemens_analyzer import SiemensCTAnalyzer

# Lataa ympäristömuuttujat Djangon .env-tiedostosta (paikallinen ajo)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent / "client" / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass  # python-dotenv ei asennettu, käytetään os.getenv-oletuksia

# Orthanc ja Fetch Service -osoitteet
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042")
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "localhost:50051")

# CT-modaliteetit
CT_MODALITIES = ("CT",)

DB_CONFIG = {
    "dbname": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "postgres"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "host": os.getenv("DATABASE_HOST", "localhost"),
    "port": os.getenv("DATABASE_PORT", "5432"),
}

logger = logging.getLogger(__name__)


def connect_db():
    """Luo tietokantayhteys ja varmista, että ct_analysis-taulu on olemassa."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ct_analysis (
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

            -- CT-kuvausparametrit
            kvp TEXT,
            tube_current TEXT,
            exposure_time TEXT,
            "exposure_mAs" TEXT,
            slice_thickness FLOAT,
            slice_spacing FLOAT,
            reconstruction_kernel TEXT,
            reconstruction_algorithm TEXT,
            ctdi_vol FLOAT,
            dlp FLOAT,

            -- Fantomi
            phantom_model TEXT,
            phantom_roll_deg FLOAT,
            origin_slice INTEGER,
            num_images INTEGER,

            -- CTP404: HU-lineaarisuus
            hu_air FLOAT,
            hu_pmp FLOAT,
            hu_ldpe FLOAT,
            hu_poly FLOAT,
            hu_acrylic FLOAT,
            hu_delrin FLOAT,
            hu_teflon FLOAT,
            slice_thickness_mm FLOAT,
            ctp404_pass BOOLEAN,

            -- CTP486: Uniformiteetti
            uniformity_index FLOAT,
            integral_non_uniformity FLOAT,
            hu_center FLOAT,
            hu_top FLOAT,
            hu_right FLOAT,
            hu_bottom FLOAT,
            hu_left FLOAT,
            ctp486_pass BOOLEAN,

            -- CTP528: MTF
            mtf_50_percent FLOAT,
            mtf_10_percent FLOAT,
            mtf_data JSONB,
            ctp528_pass BOOLEAN,

            -- CTP515: Matala kontrasti
            num_low_contrast_rois_seen INTEGER,
            median_cnr FLOAT,
            low_contrast_details JSONB,
            ctp515_pass BOOLEAN,

            -- Tulokset & kohina
            overall_pass BOOLEAN,
            noise_hu_std FLOAT,

            -- Metadata
            analysis_type TEXT DEFAULT 'CatPhan',
            analysis_version TEXT,
            processing_time FLOAT,

            -- Leikekuvat (PNG)
            summary_image BYTEA,
            hu_linearity_image BYTEA,
            thickness_image BYTEA,
            uniformity_image BYTEA,
            mtf_image BYTEA,
            low_contrast_image BYTEA,

            -- Analyysikuvaajat (PNG)
            hu_linearity_chart_image BYTEA,
            mtf_chart_image BYTEA,
            uniformity_profile_image BYTEA,
            side_view_image BYTEA
        )
    """)
    # Lisää uudet sarakkeet jos taulukko oli jo olemassa (idempotent)
    cur.execute("ALTER TABLE ct_analysis ADD COLUMN IF NOT EXISTS thickness_image BYTEA")
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


def extract_ct_metadata(ds):
    """Poimi CT-spesifiset DICOM-metatiedot datasetistä."""
    def get_tag(tag_name, default=""):
        val = ds.get(tag_name, default)
        return str(val) if val else default

    def get_float_tag(tag_name, default=None):
        val = ds.get(tag_name)
        if val is not None:
            try:
                return float(val.value if hasattr(val, 'value') else val)
            except (TypeError, ValueError):
                pass
        return default

    return {
        "content_date": get_tag("ContentDate") or get_tag("AcquisitionDate"),
        "content_time": get_tag("ContentTime"),
        "device_serial_number": get_tag("DeviceSerialNumber"),
        "instance_number": get_tag("InstanceNumber"),
        "institution_name": get_tag("InstitutionName", "Unknown"),
        "institutional_department_name": get_tag("InstitutionalDepartmentName", "Unknown"),
        "manufacturer": get_tag("Manufacturer", "Unknown"),
        "manufacturer_model_name": get_tag("ManufacturerModelName"),
        "modality": get_tag("Modality", "CT"),
        "patient_id": get_tag("PatientID"),
        "patient_name": get_tag("PatientName"),
        "station_name": get_tag("StationName", "Unknown"),
        "series_date": get_tag("SeriesDate"),
        "study_date": get_tag("StudyDate"),
        "kvp": get_tag("KVP"),
        "tube_current": get_tag("XRayTubeCurrent"),
        "exposure_time": get_tag("ExposureTime"),
        "exposure_mAs": get_tag("Exposure"),
        "slice_thickness": get_float_tag("SliceThickness"),
        "slice_spacing": get_float_tag("SpacingBetweenSlices"),
        "reconstruction_kernel": get_tag("ConvolutionKernel"),
        "reconstruction_algorithm": get_tag("ReconstructionAlgorithm"),
        "ctdi_vol": get_float_tag("CTDIvol"),
        "dlp": get_float_tag("DLP"),
    }


def detect_phantom_type(dicom_folder):
    """Tunnista fantomityyppi DICOM-metadatasta.

    Palauttaa 'CatPhan504', 'CatPhan600', 'auto' (CatPhan, malli tuntematon)
    tai 'SiemensCT'.
    """
    for dcm_file in Path(dicom_folder).glob("*.dcm"):
        try:
            ds = pydicom.dcmread(str(dcm_file), stop_before_pixels=True, force=True)
        except Exception:
            continue

        patient_name = str(ds.get("PatientName", "")).lower()
        study_desc = str(ds.get("StudyDescription", "")).lower()
        series_desc = str(ds.get("SeriesDescription", "")).lower()
        combined = f"{patient_name} {study_desc} {series_desc}"

        if "catphan" in combined and "600" in combined:
            return "CatPhan600"
        if "catphan" in combined and "504" in combined:
            return "CatPhan504"
        if "catphan" in combined:
            # CatPhan tunnistettu mutta mallinumero puuttuu → automaattitunnistus
            return "auto"
        if "siemens" in combined and ("phantom" in combined or "qa" in combined):
            return "SiemensCT"

    # Oletus: kokeile CatPhan-automaattitunnistusta
    return "auto"


def insert_ct_analysis(cur, instance_id, series_id, metadata, analysis, processing_time,
                       images=None):
    """Tallenna CT-analyysitulokset ct_analysis-tauluun."""
    if images is None:
        images = {}

    cur.execute("""
        INSERT INTO ct_analysis (
            instance, series_id, processed_at,
            content_date, content_time, device_serial_number,
            instance_number, institution_name, institutional_department_name,
            manufacturer, manufacturer_model_name, modality,
            patient_id, patient_name, station_name, series_date, study_date,
            kvp, tube_current, exposure_time, "exposure_mAs",
            slice_thickness, slice_spacing,
            reconstruction_kernel, reconstruction_algorithm,
            ctdi_vol, dlp,
            phantom_model, phantom_roll_deg, origin_slice, num_images,
            hu_air, hu_pmp, hu_ldpe, hu_poly, hu_acrylic, hu_delrin, hu_teflon,
            slice_thickness_mm, ctp404_pass,
            uniformity_index, integral_non_uniformity,
            hu_center, hu_top, hu_right, hu_bottom, hu_left, ctp486_pass,
            mtf_50_percent, mtf_10_percent, mtf_data, ctp528_pass,
            num_low_contrast_rois_seen, median_cnr, low_contrast_details, ctp515_pass,
            overall_pass, noise_hu_std,
            analysis_type, analysis_version, processing_time,
            summary_image, hu_linearity_image, thickness_image, uniformity_image, mtf_image, low_contrast_image,
            hu_linearity_chart_image, mtf_chart_image, uniformity_profile_image, side_view_image
        )
        VALUES (
            %s, %s, NOW(),
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s
        )
    """, (
        instance_id, series_id,
        metadata["content_date"], metadata["content_time"],
        metadata["device_serial_number"], metadata["instance_number"],
        metadata["institution_name"], metadata["institutional_department_name"],
        metadata["manufacturer"], metadata["manufacturer_model_name"],
        metadata["modality"], metadata["patient_id"], metadata["patient_name"],
        metadata["station_name"], metadata["series_date"], metadata["study_date"],
        metadata["kvp"], metadata["tube_current"],
        metadata["exposure_time"], metadata["exposure_mAs"],
        metadata["slice_thickness"], metadata["slice_spacing"],
        metadata["reconstruction_kernel"], metadata["reconstruction_algorithm"],
        metadata["ctdi_vol"], metadata["dlp"],
        analysis.get("phantom_model"),
        analysis.get("phantom_roll_deg"),
        analysis.get("origin_slice"),
        analysis.get("num_images"),
        analysis.get("hu_air"), analysis.get("hu_pmp"),
        analysis.get("hu_ldpe"), analysis.get("hu_poly"),
        analysis.get("hu_acrylic"), analysis.get("hu_delrin"),
        analysis.get("hu_teflon"),
        analysis.get("slice_thickness_mm"), analysis.get("ctp404_pass"),
        analysis.get("uniformity_index"), analysis.get("integral_non_uniformity"),
        analysis.get("hu_center"), analysis.get("hu_top"),
        analysis.get("hu_right"), analysis.get("hu_bottom"),
        analysis.get("hu_left"), analysis.get("ctp486_pass"),
        analysis.get("mtf_50_percent"), analysis.get("mtf_10_percent"),
        analysis.get("mtf_data"), analysis.get("ctp528_pass"),
        analysis.get("num_low_contrast_rois_seen"), analysis.get("median_cnr"),
        analysis.get("low_contrast_details"), analysis.get("ctp515_pass"),
        analysis.get("overall_pass"), analysis.get("noise_hu_std"),
        analysis.get("analysis_type", "CatPhan"),
        analysis.get("analysis_version", "0.1"),
        processing_time,
        psycopg2.Binary(images.get("summary")) if images.get("summary") else None,
        psycopg2.Binary(images.get("hu_linearity")) if images.get("hu_linearity") else None,
        psycopg2.Binary(images.get("thickness")) if images.get("thickness") else None,
        psycopg2.Binary(images.get("uniformity")) if images.get("uniformity") else None,
        psycopg2.Binary(images.get("mtf")) if images.get("mtf") else None,
        psycopg2.Binary(images.get("low_contrast")) if images.get("low_contrast") else None,
        psycopg2.Binary(images.get("hu_linearity_chart")) if images.get("hu_linearity_chart") else None,
        psycopg2.Binary(images.get("mtf_chart")) if images.get("mtf_chart") else None,
        psycopg2.Binary(images.get("uniformity_profile")) if images.get("uniformity_profile") else None,
        psycopg2.Binary(images.get("side_view")) if images.get("side_view") else None,
    ))


class CTAnalyzeService(ct_analyze_service_pb2_grpc.CTAnalyzeServiceServicer):
    def AnalyzeAllDicomData(self, request, context):
        logger.info("Received request to analyze all CT series in Orthanc")

        # Haetaan kaikki sarjat Orthancista
        response = requests.get(f"{ORTHANC_URL}/series")
        if response.status_code != 200:
            logger.error("Error: Could not fetch series from Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return ct_analyze_service_pb2.AnalyzeResponse(
                message="No series found", series_id="ALL"
            )

        series_list = response.json()
        if not series_list:
            logger.warning("No series found in Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return ct_analyze_service_pb2.AnalyzeResponse(
                message="No series available", series_id="ALL"
            )

        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()
        analyzed_count = 0

        for series_id in series_list:
            try:
                result = self._analyze_series(series_id, cur, conn, fetch_stub)
                if result:
                    analyzed_count += 1
            except Exception as e:
                logger.error("Error analyzing series %s: %s", series_id, e)
                conn.rollback()

        conn.commit()
        cur.close()
        conn.close()

        msg = f"CT analysis complete! {analyzed_count} series analyzed."
        logger.info(msg)
        return ct_analyze_service_pb2.AnalyzeResponse(message=msg, series_id="ALL")

    def AnalyzeDicomData(self, request, context):
        logger.info("Analyzing single CT series: %s", request.series_id)

        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()

        try:
            result = self._analyze_series(request.series_id, cur, conn, fetch_stub)
            conn.commit()
            msg = "Analysis complete" if result else "Analysis failed or skipped"
        except Exception as e:
            conn.rollback()
            msg = f"Analysis failed: {e}"
            logger.error(msg)
        finally:
            cur.close()
            conn.close()

        return ct_analyze_service_pb2.AnalyzeResponse(
            message=msg, series_id=request.series_id
        )

    def _analyze_series(self, series_id, cur, conn, fetch_stub):
        """Analysoi yksittäinen CT-sarja.

        CT-analyysi vaatii koko sarjan (kymmeniä leikkeitä),
        joten instanssit haetaan Fetch-palvelulta ja tallennetaan temp-kansioon.
        """
        logger.info("Processing series ID: %s", series_id)

        # Haetaan sarjan instanssit Orthancista
        instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances")
        if instance_response.status_code != 200:
            logger.error("Could not fetch instances for series %s", series_id)
            return False

        instance_list = instance_response.json()
        if not instance_list:
            logger.warning("No instances found for series %s", series_id)
            return False

        # Tarkista modaliteetti ensimmäisestä instanssista
        first_instance_id = instance_list[0]["ID"]
        try:
            fetch_response = fetch_stub.FetchDicomData(
                fetch_service_pb2.FetchRequest(instance_id=first_instance_id)
            )
            if not fetch_response.dicom_data:
                logger.warning("No data for first instance %s", first_instance_id)
                return False
            check_ds = pydicom.dcmread(io.BytesIO(fetch_response.dicom_data), force=True)
            modality = str(check_ds.get("Modality", ""))
            if modality not in CT_MODALITIES:
                logger.info("Not a CT series (modality=%s). Skipping %s", modality, series_id)
                return False
        except grpc.RpcError as e:
            logger.error("gRPC error checking modality for %s: %s", series_id, e)
            return False

        # Tarkista onko sarja jo analysoitu
        instance_key = f"{series_id}_0"
        cur.execute("SELECT id FROM ct_analysis WHERE instance = %s", (instance_key,))
        if cur.fetchone():
            logger.info("Series %s already analyzed, skipping.", series_id)
            return False

        # Hae kaikki instanssit Fetch-palvelulta ja tallenna temp-kansioon
        temp_dir = tempfile.mkdtemp(prefix="ct_analysis_")
        first_ds = None

        try:
            for idx, instance in enumerate(instance_list):
                instance_id = instance["ID"]
                logger.info("Fetching instance %d/%d: %s",
                            idx + 1, len(instance_list), instance_id)

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

                # Tallenna DICOM-tiedosto temp-kansioon
                dcm_path = os.path.join(temp_dir, f"slice_{idx:04d}.dcm")
                with open(dcm_path, 'wb') as f:
                    f.write(fetch_response.dicom_data)

                # Lue metatiedot ensimmäisestä leikkeestä
                if first_ds is None:
                    try:
                        first_ds = pydicom.dcmread(dcm_path, force=True)
                    except InvalidDicomError:
                        pass

            if first_ds is None:
                logger.error("Could not read any DICOM files for series %s", series_id)
                return False

            # Poimi DICOM-metatiedot
            metadata = extract_ct_metadata(first_ds)

            # Tunnista fantomi
            phantom_type = detect_phantom_type(temp_dir)
            logger.info("Detected phantom: %s for series %s", phantom_type, series_id)

            # Suorita analyysi
            start_time = timer()

            images = {}

            if phantom_type in ("CatPhan504", "CatPhan600", "auto"):
                try:
                    analyzer = CatphanAnalyzer(temp_dir, phantom_model=phantom_type)
                    result = analyzer.analyze()
                    analysis = CatphanAnalyzer.extract_metrics(result['results'])
                    analysis['phantom_model'] = analyzer.phantom_model
                    analysis['analysis_type'] = 'CatPhan'
                    images = result.get('images', {})
                    phantom_type = analyzer.phantom_model
                except Exception as e:
                    logger.warning(
                        "CatPhan analysis failed for %s: %s. "
                        "Falling back to basic CT analysis.", series_id, e
                    )
                    phantom_type = "BasicCT"

            if phantom_type in ("SiemensCT", "BasicCT"):
                analyzer = SiemensCTAnalyzer(temp_dir)
                result = analyzer.analyze()
                analysis = result
                analysis['phantom_model'] = phantom_type
                analysis['analysis_type'] = phantom_type
            elif phantom_type not in ("CatPhan504", "CatPhan600"):
                logger.warning("Unknown phantom type: %s", phantom_type)
                return False

            processing_time = timer() - start_time
            analysis['num_images'] = len(instance_list)

            logger.info("CT analysis complete for series %s (%.1f s, phantom=%s)",
                        series_id, processing_time, phantom_type)

            # Tallenna tietokantaan
            insert_ct_analysis(
                cur, instance_key, series_id, metadata, analysis,
                processing_time, images
            )
            return True

        except Exception as e:
            logger.error("Analysis failed for series %s: %s", series_id, e)
            raise
        finally:
            # Siivoa temp-kansio
            shutil.rmtree(temp_dir, ignore_errors=True)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    ct_analyze_service_pb2_grpc.add_CTAnalyzeServiceServicer_to_server(
        CTAnalyzeService(), server
    )
    server.add_insecure_port("[::]:50054")
    server.start()
    logger.info("CT Analyze Service running on port 50054")
    server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    serve()
