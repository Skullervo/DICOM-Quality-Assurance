# =============================================================================
# test_fetch_service.py — Fetch Servicen manuaalinen testiskripti (ei yksikkötesti)
# =============================================================================
# Pieni apuväline kehittäjälle: ottaa yhteyden paikallisesti pyörivään Fetch
# Serviceen (portti 50051), pyytää yhden DICOM-instanssin ja tallentaa sen
# levylle (test.dcm). Näin voi tarkistaa, että Fetch Service + Orthanc toimivat
# ennen kuin koko analyysiputki käynnistetään. EI aja automaattisesti CI:ssä.
# =============================================================================

import grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import requests
import logging

# Orthancin osoite (suora REST-haku instanssilistalle) ja Fetch Servicen gRPC-osoite.
# Molemmat "localhost", koska tämä skripti ajetaan kehittäjän koneelta.
ORTHANC_URL = "http://localhost:8042"
FETCH_SERVICE_ADDRESS = "localhost:50051"
logger = logging.getLogger(__name__)


# 🔹 KORVAA TÄMÄ OIKEALLA `series_id`:llä
# Kovakoodattu testisarjan tunniste — vaihda omaan Orthancissa olevaan sarjaan.
SERIES_ID = "c7d9fd60-b23d3c7c-d12a4c99-d256e73f-148d9b44"

# 🔄 Yhdistetään Fetch Serviceen ja lisätään maksimi viestikoko (200MB)
# Luo gRPC-stub (asiakaspää), jolla kutsutaan Fetch Servicen metodeja.
def get_fetch_stub():
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)


# 🔍 Haetaan ensimmäinen `instance_id` tietystä `series_id`:stä
# Fetch Service osaa hakea vain yksittäisiä instansseja, joten ensin kysytään
# Orthancilta suoraan, mitkä instanssit sarjaan kuuluvat, ja otetaan ensimmäinen.
def get_first_instance_id(series_id):
    response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances")

    if response.status_code != 200:
        logger.error("❌ Error: Could not fetch instances for series %s", series_id)
        return None

    instance_list = response.json()
    if not instance_list:
        logger.error("❌ No instances found for series %s", series_id)
        return None

    instance_id = instance_list[0]["ID"]  # otetaan listan ensimmäinen instanssi
    logger.info("📡 Using first instance_id: %s", instance_id)
    return instance_id


# 🔍 Haetaan DICOM-data Fetch-palvelulta
# Kutsuu Fetch Servicen gRPC-metodia ja tallentaa saadut tavut tiedostoon test.dcm.
def fetch_dicom_data(instance_id):
    stub = get_fetch_stub()

    try:
        logger.info("📡 Requesting DICOM data for instance ID: %s", instance_id)
        # Varsinainen gRPC-kutsu Fetch Servicelle.
        fetch_response = stub.FetchDicomData(fetch_service_pb2.FetchRequest(instance_id=instance_id))

        if fetch_response.dicom_data:
            # Onnistui: kirjoitetaan saadut DICOM-tavut levylle tarkistusta varten.
            logger.info("✅ Fetch successful: DICOM data received!")
            with open("test.dcm", "wb") as f:
                f.write(fetch_response.dicom_data)
            logger.info("💾 Saved to file: test.dcm")
            return True
        else:
            logger.error("❌ Fetch failed: No data received!")
            return False

    # gRPC-tason virhe (esim. palvelu ei vastaa tai instanssia ei löytynyt).
    except grpc.RpcError as e:
        logger.error("❌ gRPC error: %s - %s", e.code(), e.details())
        return False


# 🔥 Suoritetaan testaus
# Päälogiikka: hae ensin instanssi-id sarjasta, sitten nouda sen DICOM-data.
def main():
    instance_id = get_first_instance_id(SERIES_ID)
    
    if instance_id:
        fetch_dicom_data(instance_id)
    else:
        logger.error("❌ The test execution was aborted because the instance_id is missing.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    main()


