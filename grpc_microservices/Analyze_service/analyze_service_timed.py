import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Fetch_service')))
# ...existing imports...

import json
import traceback
import grpc
from concurrent import futures
import analyze_service_timed_pb2
import analyze_service_timed_pb2_grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import pymssql
import numpy as np
import io
import pydicom
from pydicom.errors import InvalidDicomError
from US_IQ_analysis3 import imageQualityUS
import os
import requests
import threading
import time
import logging

# 🔹 Orthanc ja Fetch Service osoitteet
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "admin")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "")
ORTHANC_AUTH = (ORTHANC_USERNAME, ORTHANC_PASSWORD) if ORTHANC_USERNAME else None
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "fetch-service:50051")

# MS SQL Server (pymssql). Skeema luodaan scripts/schema_mssql.sql:ssä.
DB_CONFIG = {
    "database": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
    "port": os.getenv("DATABASE_PORT", "1433"),
}

logger = logging.getLogger(__name__)

# 🔹 Luo tietokantayhteys (taulu on jo olemassa, ks. schema_mssql.sql)
def connect_db():
    return pymssql.connect(**DB_CONFIG)


def _ensure_failures_table(cur):
    cur.execute("""
        IF OBJECT_ID('dbo.analysis_failures','U') IS NULL
        CREATE TABLE dbo.analysis_failures (
            modality NVARCHAR(8) NOT NULL,
            orthanc_id NVARCHAR(128) NOT NULL,
            station_name NVARCHAR(256) NULL,
            reason NVARCHAR(1000) NULL,
            detail NVARCHAR(MAX) NULL,
            failed_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            CONSTRAINT pk_analysis_failures PRIMARY KEY (modality, orthanc_id)
        )
    """)
    cur.execute("""
        IF COL_LENGTH('dbo.analysis_failures','detail') IS NULL
            ALTER TABLE dbo.analysis_failures ADD detail NVARCHAR(MAX) NULL
    """)


def record_failure(cur, orthanc_id, station, reason, detail=""):
    """Tallenna epäonnistuneen analyysin syy + traceback (upsert). orthanc_id = US:llä instanssi-id."""
    try:
        _ensure_failures_table(cur)
        cur.execute("DELETE FROM analysis_failures WHERE modality=%s AND orthanc_id=%s", ("US", orthanc_id))
        cur.execute(
            "INSERT INTO analysis_failures (modality, orthanc_id, station_name, reason, detail) VALUES (%s, %s, %s, %s, %s)",
            ("US", orthanc_id, (station or "")[:256], (reason or "")[:1000], (detail or "")[:8000]))
    except Exception as e:  # noqa: BLE001
        logger.error("record_failure error: %s", e)


def clear_failure(cur, orthanc_id):
    try:
        cur.execute("DELETE FROM analysis_failures WHERE modality=%s AND orthanc_id=%s", ("US", orthanc_id))
    except Exception as e:  # noqa: BLE001
        logger.error("clear_failure error: %s", e)

# 🔹 Tarkista onko instanssi jo analysoitu
def is_instance_analyzed(cur, instance_id):
    cur.execute("SELECT 1 FROM ultrasound WHERE instance = %s", (instance_id,))
    return cur.fetchone() is not None

# 🔹 Yhdistetään Fetch Serviceen
def get_fetch_stub():
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)

class AnalyzeService(analyze_service_timed_pb2_grpc.AnalyzeServiceServicer):
    def AnalyzeAllDicomData(self, request, context):
        logger.info("📡 Received request to analyze all series in Orthanc")

        # 🔍 Haetaan kaikki sarjat Orthancista
        response = requests.get(f"{ORTHANC_URL}/series", auth=ORTHANC_AUTH)
        if response.status_code != 200:
            logger.error("❌ Error: Could not fetch series from Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_timed_pb2.AnalyzeResponse(message="No series found", series_id="ALL")

        series_list = response.json()
        if not series_list:
            logger.warning("❌ No series found in Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_timed_pb2.AnalyzeResponse(message="No series available", series_id="ALL")

        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()

        for series_id in series_list:
            logger.info("📡 Processing series ID: %s", series_id)

            # 🔍 Haetaan sarjan instanssit Orthancista
            instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances", auth=ORTHANC_AUTH)
            if instance_response.status_code != 200:
                logger.error("❌ Could not fetch instances for series %s", series_id)
                continue  # Ohitetaan tämä sarja

            instance_list = instance_response.json()
            if not instance_list:
                logger.warning("❌ No instances found for series %s", series_id)
                continue  # Ohitetaan tämä sarja

            for instance in instance_list:
                instance_id = instance["ID"]
                # Tarkista onko jo analysoitu
                if is_instance_analyzed(cur, instance_id):
                    logger.info("⏩ Instance %s already analyzed, skipping.", instance_id)
                    continue

                logger.info("📡 Fetching instance ID: %s", instance_id)

                # 🔍 Haetaan DICOM-data Fetch-palvelulta
                fetch_response = fetch_stub.FetchDicomData(fetch_service_pb2.FetchRequest(instance_id=instance_id))

                if not fetch_response.dicom_data:
                    logger.warning("❌ No data received for instance %s", instance_id)
                    continue  # Ohitetaan tämä instanssi

                # 🔄 Muutetaan binääridata DICOM-muotoon
                dicom_bytes = io.BytesIO(fetch_response.dicom_data)
                try:
                    dicom_dataset = pydicom.dcmread(dicom_bytes, force=True)
                    logger.info("✅ DICOM data successfully read!")
                except InvalidDicomError as e:
                    logger.error("❌ Error reading DICOM file: %s", e)
                    continue  # Ohitetaan tämä instanssi

                # 🔍 Haetaan metadata
                metadata = {
                    "InstitutionName": dicom_dataset.get("InstitutionName", "Unknown"),
                    "InstitutionalDepartmentName": dicom_dataset.get("InstitutionalDepartmentName", "Unknown"),
                    "Manufacturer": dicom_dataset.get("Manufacturer", "Unknown"),
                    "ManufacturerModelName": dicom_dataset.get("ManufacturerModelName", ""),
                    "Modality": dicom_dataset.get("Modality", "Unknown"),
                    "StationName": dicom_dataset.get("StationName", "Unknown"),
                    "SeriesDate": dicom_dataset.get("SeriesDate", "Unknown"),
                    "StudyDate": dicom_dataset.get("StudyDate", ""),
                    "ContentDate": dicom_dataset.get("ContentDate", ""),
                    "DeviceSerialNumber": dicom_dataset.get("DeviceSerialNumber", ""),
                    "ContentTime": dicom_dataset.get("ContentTime", ""),
                }

                if metadata["Modality"] != "US":
                    logger.info("❌ Not an ultrasound image. Skipping instance %s", instance_id)
                    continue  # Ohitetaan tämä instanssi

                # 📊 Analysoidaan kuva
                image_array = dicom_dataset.pixel_array
                analysis = imageQualityUS(dicom_dataset, dicom_bytes, image_array, "probe-LUT.xls")

                try:
                    result = analysis.MAIN_US_analysis()
                except Exception as e:
                    logger.error("❌ Analysis failed for instance %s: %s", instance_id, e)
                    record_failure(cur, instance_id, str(metadata.get("StationName", "")), str(e), traceback.format_exc())
                    conn.commit()
                    continue

                # 🔹 Muunnetaan tulokset JSON-muotoon
                json_result = {
                    key: float(value) if isinstance(value, np.float64)
                    else value.tolist() if isinstance(value, np.ndarray)
                    else value for key, value in result.items()
                }

                # HUOM: u_cov/u_skew ovat QA-tuloksia (laitteen tasaisuus), EIVÄT
                # analyysin onnistumisen mittareita. Jos MAIN_US_analysis tuotti
                # metriikat, suoristus onnistui -> tulos tallennetaan aina.
                # Suoristuksen epäonnistuminen jäljitetään sen omassa kohdassa
                # (transform_convex/​sector_image2linear nostaa poikkeuksen), joka
                # päätyy yllä olevaan except-haaraan tracebackin kanssa.

                # 📂 Tallennetaan analyysitulokset tietokantaan
                transducer_name = json_result.get('transducer_name', '')
                horiz_prof = json.dumps(json_result.get('horiz_profile', []))
                vert_prof = json.dumps(json_result.get('vert_profiles', []))
                cur.execute("""
                    INSERT INTO ultrasound (
                        institutionname, institutionaldepartmentname, manufacturer, modality,
                        stationname, seriesdate, instance, serie, S_depth, U_cov, U_skew, U_low,
                        horiz_prof, vert_prof, tranducertype,
                        manufacturermodelname, studydate, contentdate, deviceserialnumber, contenttime
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    metadata["InstitutionName"],
                    metadata["InstitutionalDepartmentName"],
                    metadata["Manufacturer"],
                    metadata["Modality"],
                    metadata["StationName"],
                    metadata["SeriesDate"],
                    instance_id,
                    series_id,
                    float(json_result['S_depth']),
                    float(json_result['U_cov']),
                    float(json_result['U_skew']),
                    json.dumps([float(val) for val in json_result['U_low']]),
                    horiz_prof,
                    vert_prof,
                    transducer_name,
                    metadata["ManufacturerModelName"],
                    metadata["StudyDate"],
                    metadata["ContentDate"],
                    metadata["DeviceSerialNumber"],
                    metadata["ContentTime"],
                ))
                clear_failure(cur, instance_id)  # onnistui -> poista mahdollinen epäonnistumismerkintä

        conn.commit()
        cur.close()
        conn.close()

        return analyze_service_timed_pb2.AnalyzeResponse(message="Analysis complete for all new series!", series_id="ALL")

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    analyze_service_timed_pb2_grpc.add_AnalyzeServiceServicer_to_server(AnalyzeService(), server)
    server.add_insecure_port("[::]:50052")
    server.start()
    logger.info("🚀 Analyze Service running on port 50052")
    server.wait_for_termination()

def start_analyze_scheduler(interval_seconds=3600):
    def loop():
        while True:
            logger.info("⏰ Ajastettu analyysi käynnistyy")
            service = AnalyzeService()
            class DummyContext:
                def set_code(self, code): pass
            service.AnalyzeAllDicomData(None, DummyContext())
            logger.info("🕒 Odotetaan %s sekuntia seuraavaan ajoon...", interval_seconds)
            time.sleep(interval_seconds)
    t = threading.Thread(target=loop, daemon=True)
    t.start()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    start_analyze_scheduler(60)  # Ajastettu analyysi (esim. kerran minuutissa)
    serve()                        # Käynnistää gRPC-palvelimen