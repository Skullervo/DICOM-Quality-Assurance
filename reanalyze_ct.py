"""Suorita CT-uudelleenanalyysi CatPhan600-mallilla ja tallenna kantaan."""
import os
import sys
import tempfile
import shutil
import requests
import psycopg2
import psycopg2.extras
import pydicom
import io
import json
import logging
from pathlib import Path
from time import time as timer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "grpc_microservices", "CT_analyze_service"))

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent / "client" / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

from catphan_analyzer import CatphanAnalyzer

ORTHANC = os.getenv("ORTHANC_URL", "http://localhost:8042")
AUTH = (os.getenv("ORTHANC_USERNAME", "admin"), os.getenv("ORTHANC_PASSWORD", "admin"))
SERIES_ID = "e3eab0e7-0c0f4c1e-be823136-4f6765ec-a7b8f419"

DB_CONFIG = {
    "dbname": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "postgres"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "host": os.getenv("DATABASE_HOST", "localhost"),
    "port": os.getenv("DATABASE_PORT", "5432"),
}

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")


def download_series(series_id, dest_dir):
    instances = requests.get(f"{ORTHANC}/series/{series_id}/instances", auth=AUTH).json()
    print(f"Downloading {len(instances)} instances...")
    first_ds = None
    for idx, inst in enumerate(instances):
        resp = requests.get(f"{ORTHANC}/instances/{inst['ID']}/file", auth=AUTH)
        dcm_path = os.path.join(dest_dir, f"slice_{idx:04d}.dcm")
        with open(dcm_path, "wb") as f:
            f.write(resp.content)
        if first_ds is None:
            first_ds = pydicom.dcmread(dcm_path, force=True)
    return len(instances), first_ds


def main():
    temp_dir = tempfile.mkdtemp(prefix="ct_reanalyze_")
    print(f"Temp dir: {temp_dir}")

    try:
        n, first_ds = download_series(SERIES_ID, temp_dir)
        print(f"Downloaded {n} DICOM files")

        # Analyysi
        start = timer()
        analyzer = CatphanAnalyzer(temp_dir, phantom_model='auto')
        print(f"Detected model: {analyzer.phantom_model}")

        result = analyzer.analyze()
        analysis = CatphanAnalyzer.extract_metrics(result['results'])
        analysis['phantom_model'] = analyzer.phantom_model
        analysis['analysis_type'] = 'CatPhan'
        analysis['num_images'] = n
        images = result.get('images', {})
        elapsed = timer() - start

        print(f"\nAnalysis done in {elapsed:.1f}s")
        print(f"MTF 50%: {analysis.get('mtf_50_percent')}")
        print(f"MTF 10%: {analysis.get('mtf_10_percent')}")
        print(f"HU acrylic: {analysis.get('hu_acrylic')}")
        print(f"Images: {list(images.keys())}")

        # Tallenna kantaan
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        instance_key = f"{SERIES_ID}_0"

        # Poista mahdollinen vanha rivi
        cur.execute("DELETE FROM ct_analysis WHERE instance = %s", (instance_key,))

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
                hu_linearity_image, thickness_image, uniformity_image, mtf_image, low_contrast_image,
                hu_linearity_chart_image, mtf_chart_image, uniformity_profile_image, side_view_image
            ) VALUES (
                %s, %s, NOW(),
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s
            )
        """, (
            instance_key, SERIES_ID,
            str(first_ds.get("ContentDate", "")), str(first_ds.get("ContentTime", "")),
            str(first_ds.get("DeviceSerialNumber", "")),
            str(first_ds.get("InstanceNumber", "")),
            str(first_ds.get("InstitutionName", "Unknown")),
            str(first_ds.get("InstitutionalDepartmentName", "Unknown")),
            str(first_ds.get("Manufacturer", "Unknown")),
            str(first_ds.get("ManufacturerModelName", "")),
            str(first_ds.get("Modality", "CT")),
            str(first_ds.get("PatientID", "")),
            str(first_ds.get("PatientName", "")),
            str(first_ds.get("StationName", "Unknown")),
            str(first_ds.get("SeriesDate", "")),
            str(first_ds.get("StudyDate", "")),
            str(first_ds.get("KVP", "")),
            str(first_ds.get("XRayTubeCurrent", "")),
            str(first_ds.get("ExposureTime", "")),
            str(first_ds.get("Exposure", "")),
            float(first_ds.get("SliceThickness", 0) or 0),
            float(first_ds.get("SpacingBetweenSlices", 0) or 0),
            str(first_ds.get("ConvolutionKernel", "")),
            str(first_ds.get("ReconstructionAlgorithm", "")),
            float(first_ds.get("CTDIvol", 0) or 0),
            float(first_ds.get("DLP", 0) or 0),
            analysis.get("phantom_model"), analysis.get("phantom_roll_deg"),
            analysis.get("origin_slice"), analysis.get("num_images"),
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
            analysis.get("analysis_type", "CatPhan"), "0.2", elapsed,
            psycopg2.Binary(images.get("hu_linearity", b"")),
            psycopg2.Binary(images.get("thickness", b"")),
            psycopg2.Binary(images.get("uniformity", b"")),
            psycopg2.Binary(images.get("mtf", b"")),
            psycopg2.Binary(images.get("low_contrast", b"")),
            psycopg2.Binary(images.get("hu_linearity_chart", b"")),
            psycopg2.Binary(images.get("mtf_chart", b"")),
            psycopg2.Binary(images.get("uniformity_profile", b"")),
            psycopg2.Binary(images.get("side_view", b"")),
        ))

        conn.commit()
        cur.close()
        conn.close()
        print(f"\nSaved to database: instance={instance_key}")
        print(f"phantom_model=CatPhan600, mtf_50%={analysis.get('mtf_50_percent'):.3f}")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"Cleaned up {temp_dir}")


if __name__ == "__main__":
    main()
