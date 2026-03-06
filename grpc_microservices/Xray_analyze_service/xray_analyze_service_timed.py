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
import threading
import time
import logging

from normi13_qa.normi13 import Normi13

# Tuodaan apufunktiot pääpalvelusta
from xray_analyze_service import (
    DB_CONFIG, ORTHANC_URL, FETCH_SERVICE_ADDRESS, XRAY_MODALITIES,
    connect_db, get_fetch_stub, extract_dicom_metadata,
    extract_analysis_results, insert_xray_analysis,
)

logger = logging.getLogger(__name__)


def is_instance_analyzed(cur, instance_id):
    """Tarkista onko instanssi jo analysoitu."""
    cur.execute("SELECT 1 FROM xray_analysis WHERE instance = %s", (instance_id,))
    return cur.fetchone() is not None


class XrayAnalyzeService(xray_analyze_service_pb2_grpc.XrayAnalyzeServiceServicer):
    def AnalyzeAllDicomData(self, request, context):
        logger.info("Timed: Received request to analyze all X-ray series in Orthanc")

        response = requests.get(f"{ORTHANC_URL}/series")
        if response.status_code != 200:
            logger.error("Error: Could not fetch series from Orthanc")
            if context:
                context.set_code(grpc.StatusCode.NOT_FOUND)
            return xray_analyze_service_pb2.AnalyzeResponse(
                message="No series found", series_id="ALL"
            )

        series_list = response.json()
        if not series_list:
            logger.warning("No series found in Orthanc")
            if context:
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

                # Deduplikaatiotarkistus
                if is_instance_analyzed(cur, instance_id):
                    logger.info("Instance %s already analyzed, skipping.", instance_id)
                    continue

                logger.info("Fetching instance ID: %s", instance_id)

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

                dicom_bytes = fetch_response.dicom_data
                try:
                    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), force=True)
                except InvalidDicomError as e:
                    logger.error("Error reading DICOM file: %s", e)
                    continue

                modality = str(ds.get("Modality", ""))
                if modality not in XRAY_MODALITIES:
                    logger.info("Not an X-ray image (modality=%s). Skipping instance %s",
                                modality, instance_id)
                    continue

                tmp_path = None
                contrast_rois_bytes = None
                mtf_curve_bytes = None
                try:
                    with tempfile.NamedTemporaryFile(suffix='.dcm', delete=False) as tmp:
                        tmp.write(dicom_bytes)
                        tmp_path = tmp.name

                    start_time = timer()
                    with tempfile.TemporaryDirectory() as fig_dir:
                        IQ = Normi13(tmp_path, plot=True, debug=False,
                                     mtf_mode='relative', fig_path=Path(fig_dir))
                        IQ.analyze(visibility_threshold=0.0025)
                        results = IQ.results_data(as_dict=True)
                        processing_time = timer() - start_time

                        for png_file in globmod.glob(os.path.join(fig_dir, "*_contrast_rois.png")):
                            with open(png_file, "rb") as f:
                                contrast_rois_bytes = f.read()
                        for png_file in globmod.glob(os.path.join(fig_dir, "*_mtf.png")):
                            with open(png_file, "rb") as f:
                                mtf_curve_bytes = f.read()

                    logger.info("Analysis complete for instance %s (%.1f s, rois=%s, mtf=%s)",
                                instance_id, processing_time,
                                "yes" if contrast_rois_bytes else "no",
                                "yes" if mtf_curve_bytes else "no")

                except Exception as e:
                    logger.error("Analysis failed for instance %s: %s", instance_id, e)
                    continue
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        os.unlink(tmp_path)

                metadata = extract_dicom_metadata(ds)
                analysis = extract_analysis_results(results, IQ)

                try:
                    insert_xray_analysis(
                        cur, instance_id, series_id, metadata, analysis,
                        processing_time, contrast_rois_bytes, mtf_curve_bytes
                    )
                    conn.commit()
                    analyzed_count += 1
                except psycopg2.IntegrityError:
                    conn.rollback()
                    logger.info("Instance %s already in database, skipping.", instance_id)
                    continue

        cur.close()
        conn.close()

        msg = f"Timed X-ray analysis complete! {analyzed_count} new instances analyzed."
        logger.info(msg)
        return xray_analyze_service_pb2.AnalyzeResponse(message=msg, series_id="ALL")

    def AnalyzeDicomData(self, request, context):
        logger.info("Single series analysis not yet implemented for X-ray")
        return xray_analyze_service_pb2.AnalyzeResponse(
            message="Not implemented", series_id=request.series_id
        )


def start_analyze_scheduler(interval_seconds=3600):
    """Käynnistä ajastettu analyysi taustasäikeessä."""
    def loop():
        while True:
            logger.info("Ajastettu X-ray analyysi käynnistyy")
            service = XrayAnalyzeService()

            class DummyContext:
                def set_code(self, code):
                    pass

            service.AnalyzeAllDicomData(None, DummyContext())
            logger.info("Odotetaan %s sekuntia seuraavaan ajoon...", interval_seconds)
            time.sleep(interval_seconds)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    xray_analyze_service_pb2_grpc.add_XrayAnalyzeServiceServicer_to_server(
        XrayAnalyzeService(), server
    )
    server.add_insecure_port("[::]:50053")
    server.start()
    logger.info("X-ray Analyze Service (timed) running on port 50053")
    server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    start_analyze_scheduler(3600)  # Ajastettu analyysi kerran tunnissa
    serve()
