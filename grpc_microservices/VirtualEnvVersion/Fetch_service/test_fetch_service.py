import grpc
import fetch_service_pb2
import fetch_service_pb2_grpc
import requests

# Orthancin osoite
ORTHANC_URL = "http://localhost:8042"
FETCH_SERVICE_ADDRESS = "localhost:50051"

# 🔹 KORVAA TÄMÄ OIKEALLA `series_id`:llä
SERIES_ID = "c7d9fd60-b23d3c7c-d12a4c99-d256e73f-148d9b44"

# 🔄 Yhdistetään Fetch Serviceen ja lisätään maksimi viestikoko (200MB)
def get_fetch_stub():
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)


# 🔍 Haetaan ensimmäinen `instance_id` tietystä `series_id`:stä
def get_first_instance_id(series_id):
    response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances")
    
    if response.status_code != 200:
        print(f"❌ Error: Could not fetch instances for series {series_id}")
        return None

    instance_list = response.json()
    if not instance_list:
        print(f"❌ No instances found for series {series_id}")
        return None

    instance_id = instance_list[0]["ID"]
    print(f"📡 Using first instance_id: {instance_id}")
    return instance_id


# 🔍 Haetaan DICOM-data Fetch-palvelulta
def fetch_dicom_data(instance_id):
    stub = get_fetch_stub()
    
    try:
        print(f"📡 Requesting DICOM data for instance ID: {instance_id}")
        fetch_response = stub.FetchDicomData(fetch_service_pb2.FetchRequest(instance_id=instance_id))
        
        if fetch_response.dicom_data:
            print("✅ Fetch successful: DICOM data received!")
            with open("test.dcm", "wb") as f:
                f.write(fetch_response.dicom_data)
            print("💾 Saved to file: test.dcm")
            return True
        else:
            print("❌ Fetch failed: No data received!")
            return False

    except grpc.RpcError as e:
        print(f"❌ gRPC error: {e.code()} - {e.details()}")
        return False


# 🔥 Suoritetaan testaus
def main():
    instance_id = get_first_instance_id(SERIES_ID)
    
    if instance_id:
        fetch_dicom_data(instance_id)
    else:
        print("❌ The test execution was aborted because the instance_id is missing.")


if __name__ == "__main__":
    main()


