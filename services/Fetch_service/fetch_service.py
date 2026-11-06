# =============================================================================
# Fetch Service — DICOM-hakupalvelu (gRPC, portti 50051)
# =============================================================================
# ROOLI PUTKESSA:  Orthanc  ->  [Fetch Service]  ->  Analyze-palvelut  ->  MS SQL
#
# Tämä on putken yksinkertaisin palvelu. Se EI analysoi mitään, vaan toimii
# ohuena välittäjänä: analyysipalvelut (US/XR/CT) kysyvät tältä palvelulta
# yksittäisen DICOM-instanssin raakatavut Orthanc-PACS-palvelimelta ja saavat
# ne takaisin gRPC-vastauksena. Haku tehdään Orthancin REST-rajapinnan kautta.
#
# HUOM: Uudessa event-driven-mallissa (worker_*_eventdriven.py) workerit hakevat
# DICOMit suoraan Orthancin REST-rajapinnasta eivätkä käytä tätä palvelua. Tämä
# palvelu on yhä käytössä vanhan pollaus-mallin (analyze_service_timed.py) kanssa.
# =============================================================================

import grpc                          # gRPC-kirjasto (palvelin + statuskoodit)
from concurrent import futures       # säiepooli gRPC-palvelimelle
import fetch_service_pb2
import fetch_service_pb2_grpc
import requests
import os
import logging

# --- Orthanc-PACS-palvelimen osoite ja kirjautumistiedot ympäristömuuttujista ---
# Oletusarvo "http://orthanc:8042" on kontti-/Kubernetes-verkon palvelunimi.
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "")
# Jos käyttäjätunnus on asetettu, käytetään HTTP Basic -autentikointia; muuten None
# (Orthanc ilman salasanasuojausta esim. kehitysympäristössä).
ORTHANC_AUTH = (ORTHANC_USERNAME, ORTHANC_PASSWORD) if ORTHANC_USERNAME else None

logger = logging.getLogger(__name__)


# gRPC-käsittelijäluokka. Toteuttaa .proto-tiedostossa määritellyn FetchService-
# rajapinnan. gRPC kutsuu näitä metodeja automaattisesti, kun asiakas lähettää pyynnön.
class FetchService(fetch_service_pb2_grpc.FetchServiceServicer):
    # Hae yhden DICOM-instanssin raakatavut Orthancista. request.instance_id on
    # Orthancin sisäinen tunniste instanssille (ei DICOM SOP Instance UID).
    def FetchDicomData(self, request, context):
        logger.info("🔍 Fetching DICOM file for instance ID: %s", request.instance_id)

        # Orthancin REST-rajapinta: /instances/<id>/file palauttaa alkuperäisen
        # DICOM-tiedoston binääritavuina.
        response = requests.get(f"{ORTHANC_URL}/instances/{request.instance_id}/file", auth=ORTHANC_AUTH)
        # Jos instanssia ei löytynyt (tai muu virhe), palautetaan gRPC-virhe NOT_FOUND
        # ja tyhjä vastaus, jotta kutsuva analyysipalvelu voi ohittaa tämän kuvan.
        if response.status_code != 200:
            logger.error("❌ Error: Instance %s not found in Orthanc!", request.instance_id)
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"Failed to fetch DICOM file for instance {request.instance_id}")
            return fetch_service_pb2.FetchResponse()

        # Onnistui: palautetaan DICOM-tavut gRPC-vastauksen dicom_data-kentässä.
        logger.info("✅ Successfully fetched DICOM file for %s", request.instance_id)
        return fetch_service_pb2.FetchResponse(dicom_data=response.content)

# Käynnistä gRPC-palvelin ja jää kuuntelemaan pyyntöjä portissa 50051.
def serve():
    # 🔹 Lisää maksimi viestikoko (200MB)
    # DICOM-kuvat (erityisesti CT-sarjat) voivat olla kymmeniä megatavuja, joten
    # gRPC:n oletusraja (4 MB) nostetaan 200 MB:iin sekä lähetykselle että vastaanotolle.
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]

    # Luo palvelin 10 työsäikeen poolilla (10 rinnakkaista pyyntöä kerrallaan).
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
    # Rekisteröi yllä oleva käsittelijäluokka palvelimelle.
    fetch_service_pb2_grpc.add_FetchServiceServicer_to_server(FetchService(), server)
    # Kuuntele kaikkia verkkoliitäntöjä (IPv6 [::]) portissa 50051 ilman TLS-salausta
    # (sisäverkon liikenne; ulkoinen TLS hoidetaan proxyssä).
    server.add_insecure_port("[::]:50051")
    server.start()
    logger.info("🚀 Fetch Service running on port 50051")
    server.wait_for_termination()  # estä pääsäiettä päättymästä; palvelin jää pyörimään


# Suoritetaan vain kun tiedosto ajetaan suoraan (ei importattaessa).
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    serve()

