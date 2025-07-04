import sys
import os
import logging
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Fetch_service')))
# ...existing imports...

import grpc
from concurrent import futures
import analyze_service_timed_pb2
import analyze_service_timed_pb2_grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import psycopg2
import psycopg2.extras
import numpy as np
import io
import pydicom
from pydicom.errors import InvalidDicomError
from US_IQ_analysis3 import imageQualityUS
import os
import requests
import threading
import time

# Lisää logituksen konfigurointi heti alkuun
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        #logging.StreamHandler(),  # Tulostaa konsoliin
        logging.FileHandler("analyze_service.log", encoding="utf-8"),  # Jos haluat myös tiedostoon
    ]
)

# 🔹 Orthanc ja Fetch Service osoitteet
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042") #virtualenv path
#FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "fetch-service:50051")
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "localhost:50051")

# Database settings
DB_CONFIG = {
    "dbname": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "postgres"),
    "password": os.getenv("DATABASE_PASSWORD", "pohde24"),
    "host": os.getenv("DATABASE_HOST", "localhost"),
    "port": os.getenv("DATABASE_PORT", "5432"),
}

# 🔹 Luo tietokantayhteys ja varmista, että taulu on olemassa
def connect_db():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("""
            CREATE TABLE IF NOT EXISTS ultrasound (
            id SERIAL PRIMARY KEY,
            contentdate TEXT,
            contenttime TEXT,
            deviceserialnumber TEXT,
            instancenumber TEXT,
            institutionname TEXT,
            institutionaldepartmentname TEXT,
            manufacturer TEXT,
            manufacturermodelname TEXT,
            modality TEXT,
            patientid TEXT,
            patientname TEXT,
            sopclassuid TEXT,
            sopinstanceuid TEXT,
            seriesdate TEXT, 
            seriesinstanceuid TEXT,
            seriesnumber TEXT,
            seriestime TEXT,
            stationname TEXT,
            studydate TEXT,
            studyid TEXT,
            instance TEXT,
            studytime TEXT,
            tranducertype TEXT,
            serie TEXT,
            S_depth FLOAT,
            U_cov FLOAT,
            U_skew FLOAT,
            U_low JSONB,
            horiz_prof JSONB,
            vert_prof JSONB
        )
    """)
    conn.commit()
    cur.close()
    return conn

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
        print("📡 Received request to analyze all series in Orthanc")
        logging.info("Received request to analyze all series in Orthanc")

        # 🔍 Haetaan kaikki sarjat Orthancista
        response = requests.get(f"{ORTHANC_URL}/series")
        if response.status_code != 200:
            print("❌ Error: Could not fetch series from Orthanc")
            logging.error("Error: Could not fetch series from Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_timed_pb2.AnalyzeResponse(message="No series found", series_id="ALL")

        series_list = response.json()
        if not series_list:
            print("❌ No series found in Orthanc")
            logging.error("❌ No series found in Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return analyze_service_timed_pb2.AnalyzeResponse(message="No series available", series_id="ALL")

        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()

        for series_id in series_list:
            print(f"📡 Processing series ID: {series_id}")
            logging.info(f"Processing series ID: {series_id}")

            # 🔍 Haetaan sarjan instanssit Orthancista
            instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances")
            if instance_response.status_code != 200:
                print(f"❌ Could not fetch instances for series {series_id}")
                logging.error(f"Could not fetch instances for series {series_id}")
                continue  # Ohitetaan tämä sarja

            instance_list = instance_response.json()
            if not instance_list:
                print(f"❌ No instances found for series {series_id}")
                logging.error(f"No instances found for series {series_id}")
                continue  # Ohitetaan tämä sarja

            for instance in instance_list:
                instance_id = instance["ID"]
                # Tarkista onko jo analysoitu
                if is_instance_analyzed(cur, instance_id):
                    print(f"⏩ Instance {instance_id} already analyzed, skipping.")
                    logging.info(f"Instance {instance_id} already analyzed, skipping.")
                    continue

                print(f"📡 Fetching instance ID: {instance_id}")
                logging.info(f"Fetching instance ID: {instance_id}")

                # 🔍 Haetaan DICOM-data Fetch-palvelulta
                fetch_response = fetch_stub.FetchDicomData(fetch_service_pb2.FetchRequest(instance_id=instance_id))

                if not fetch_response.dicom_data:
                    print(f"❌ No data received for instance {instance_id}")
                    logging.error(f"No data received for instance {instance_id}")
                    continue  # Ohitetaan tämä instanssi

                # 🔄 Muutetaan binääridata DICOM-muotoon
                dicom_bytes = io.BytesIO(fetch_response.dicom_data)
                try:
                    dicom_dataset = pydicom.dcmread(dicom_bytes, force=True)
                    print("✅ DICOM data successfully read!")
                    logging.info("DICOM data successfully read!")
                except InvalidDicomError as e:
                    print(f"❌ Error reading DICOM file: {e}")
                    logging.error(f"Error reading DICOM file: {e}")
                    continue  # Ohitetaan tämä instanssi

                # 🔍 Haetaan metadata
                # metadata = {
                #     "ContentDate": dicom_dataset.get("ContentDate", "Unknown"),
                #     "InstitutionName": dicom_dataset.get("InstitutionName", "Unknown"),
                #     "InstitutionalDepartmentName": dicom_dataset.get("InstitutionalDepartmentName", "Unknown"),
                #     "Manufacturer": dicom_dataset.get("Manufacturer", "Unknown"),
                #     "Modality": dicom_dataset.get("Modality", "Unknown"),
                #     "StationName": dicom_dataset.get("StationName", "Unknown"),
                #     "SeriesDate": dicom_dataset.get("SeriesDate", "Unknown")
                # }
                
                metadata = {
                    "ContentDate": dicom_dataset.get("ContentDate", "Unknown"),
                    "ContentTime": dicom_dataset.get("ContentTime", "Unknown"),
                    "DeviceSerialNumber": dicom_dataset.get("DeviceSerialNumber", "Unknown"),
                    "InstanceNumber": dicom_dataset.get("InstanceNumber", "Unknown"),
                    "InstitutionName": dicom_dataset.get("InstitutionName", "Unknown"),
                    "InstitutionalDepartmentName": dicom_dataset.get("InstitutionalDepartmentName", "Unknown"),
                    "Manufacturer": dicom_dataset.get("Manufacturer", "Unknown"),
                    "ManufacturerModelName": dicom_dataset.get("ManufacturerModelName", "Unknown"),
                    "Modality": dicom_dataset.get("Modality", "Unknown"),
                    "PatientID": dicom_dataset.get("PatientID", "Unknown"),
                    "PatientName": str(dicom_dataset.get("PatientName", "Unknown")),
                    "SOPClassUID": dicom_dataset.get("SOPClassUID", "Unknown"),
                    "SOPInstanceUID": dicom_dataset.get("SOPInstanceUID", "Unknown"),
                    "SeriesDate": dicom_dataset.get("SeriesDate", "Unknown"),
                    "SeriesInstanceUID": dicom_dataset.get("SeriesInstanceUID", "Unknown"),
                    "SeriesNumber": dicom_dataset.get("SeriesNumber", "Unknown"),
                    "SeriesTime": dicom_dataset.get("SeriesTime", "Unknown"),
                    "StationName": dicom_dataset.get("StationName", "Unknown"),
                    "StudyDate": dicom_dataset.get("StudyDate", "Unknown"),
                    "StudyID": dicom_dataset.get("StudyID", "Unknown"),
                    "StudyInstanceUID": dicom_dataset.get("StudyInstanceUID", "Unknown"),
                    "StudyTime": dicom_dataset.get("StudyTime", "Unknown"),
                    "TranducerType": dicom_dataset.get((0x0018, 0x6031), "Unknown")  # transducer name
                }


                if metadata["Modality"] != "US":
                    print("❌ Not an ultrasound image. Skipping...")
                    logging.info("Not an ultrasound image. Skipping...")
                    continue  # Ohitetaan tämä instanssi

                # 📊 Analysoidaan kuva
                image_array = dicom_dataset.pixel_array
                analysis = imageQualityUS(dicom_dataset, dicom_bytes, image_array, "probe-LUT.xls")
                result = analysis.MAIN_US_analysis()
                # import matplotlib.pyplot as plt
                # plt.imshow(result['im'], cmap='gray')
                # plt.title('DICOM Image')
                # plt.axis('off')
                # plt.savefig('dicom_kuva.png', bbox_inches='tight', pad_inches=0)
                # plt.show()

                # 🔹 Muunnetaan tulokset JSON-muotoon
                json_result = {
                    key: float(value) if isinstance(value, np.float64)
                    else value.tolist() if isinstance(value, np.ndarray)
                    else value for key, value in result.items()
                }

                # 📂 Tallennetaan analyysitulokset tietokantaan
                # cur.execute("""
                #     INSERT INTO ultrasound (
                #         contentdate, institutionname, institutionaldepartmentname, manufacturer, modality, 
                #         stationname, seriesdate, studyinstanceuid, serie, S_depth, U_cov, U_skew, U_low
                #     ) 
                #     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                # """, (
                #     metadata["ContentDate"],
                #     metadata["InstitutionName"],
                #     metadata["InstitutionalDepartmentName"],
                #     metadata["Manufacturer"],
                #     metadata["Modality"],
                #     metadata["StationName"],
                #     metadata["SeriesDate"],
                #     instance_id,
                #     series_id,
                #     float(json_result['S_depth']),
                #     float(json_result['U_cov']),
                #     float(json_result['U_skew']),
                #     [float(val) for val in json_result['U_low']]
                # ))
                
                cur.execute("""
                    INSERT INTO ultrasound (
                        contentdate, contenttime, deviceserialnumber, instancenumber, institutionname,
                        institutionaldepartmentname, manufacturer, manufacturermodelname, modality,
                        patientid, patientname, sopclassuid, sopinstanceuid, seriesdate,
                        seriesinstanceuid, seriesnumber, seriestime, stationname, studydate,
                        studyid, instance, studytime, tranducertype, serie,
                        S_depth, U_cov, U_skew, U_low, horiz_prof, vert_prof
                    )
                    VALUES (%s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s)
                """, (
                    metadata["ContentDate"],
                    metadata["ContentTime"],
                    metadata["DeviceSerialNumber"],
                    metadata["InstanceNumber"],
                    metadata["InstitutionName"],
                    metadata["InstitutionalDepartmentName"],
                    metadata["Manufacturer"],
                    metadata["ManufacturerModelName"],
                    metadata["Modality"],
                    metadata["PatientID"],
                    metadata["PatientName"],
                    str(metadata["SOPClassUID"]),
                    str(metadata["SOPInstanceUID"]),
                    metadata["SeriesDate"],
                    metadata["SeriesInstanceUID"],
                    metadata["SeriesNumber"],
                    metadata["SeriesTime"],
                    metadata["StationName"],
                    metadata["StudyDate"],
                    metadata["StudyID"],
                    # metadata["StudyInstanceUID"],
                    instance_id,
                    metadata["StudyTime"],
                    str(metadata["TranducerType"]),
                    series_id,
                    float(json_result['S_depth']),
                    float(json_result['U_cov']),
                    float(json_result['U_skew']),
                    # [float(val) for val in json_result['U_low']]
                    psycopg2.extras.Json([float(val) for val in json_result['U_low']]),
                    psycopg2.extras.Json([float(val) for val in json_result['horiz_profile']]),
                    psycopg2.extras.Json([float(val) for val in json_result['vert_profiles']])
                ))


        conn.commit()
        cur.close()
        conn.close()

        return analyze_service_timed_pb2.AnalyzeResponse(message="Analysis complete for all new series!", series_id="ALL")

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    analyze_service_timed_pb2_grpc.add_AnalyzeServiceServicer_to_server(AnalyzeService(), server)
    server.add_insecure_port("[::]:50052")
    server.start()
    print("🚀 Analyze Service running on port 50052")
    logging.info("Analyze Service running on port 50052")
    server.wait_for_termination()

def start_analyze_scheduler(interval_seconds=3600):
    def loop():
        while True:
            print("⏰ Ajastettu analyysi käynnistyy")
            logging.info("Ajastettu analyysi käynnistyy")
            service = AnalyzeService()
            class DummyContext:
                def set_code(self, code): pass
            service.AnalyzeAllDicomData(None, DummyContext())
            print(f"🕒 Odotetaan {interval_seconds} sekuntia seuraavaan ajoon...")
            logging.info(f"Odotetaan {interval_seconds} sekuntia seuraavaan ajoon...")
            time.sleep(interval_seconds)
    t = threading.Thread(target=loop, daemon=True)
    t.start()

if __name__ == "__main__":
    start_analyze_scheduler(60)  # Ajastettu analyysi (esim. kerran minuutissa)
    serve()                        # Käynnistää gRPC-palvelimen