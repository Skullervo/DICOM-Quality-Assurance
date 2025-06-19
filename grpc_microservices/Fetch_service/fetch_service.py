import grpc
from concurrent import futures
import fetch_service_pb2
import fetch_service_pb2_grpc
import requests
import os

#ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042") # virtuaaliympäristössä
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://host.docker.internal:8042") # kontissa


class FetchService(fetch_service_pb2_grpc.FetchServiceServicer):
    def FetchDicomData(self, request, context):
        print(f"🔍 Fetching DICOM file for instance ID: {request.instance_id}")

        response = requests.get(f"{ORTHANC_URL}/instances/{request.instance_id}/file")
        if response.status_code != 200:
            print(f"❌ Error: Instance {request.instance_id} not found in Orthanc!")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"Failed to fetch DICOM file for instance {request.instance_id}")
            return fetch_service_pb2.FetchResponse()

        print(f"✅ Successfully fetched DICOM file for {request.instance_id}")
        return fetch_service_pb2.FetchResponse(dicom_data=response.content)

def serve():
    # 🔹 Lisää maksimi viestikoko (200MB)
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
    fetch_service_pb2_grpc.add_FetchServiceServicer_to_server(FetchService(), server)
    server.add_insecure_port("[::]:50051")
    server.start()
    print("🚀 Fetch Service running on port 50051")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()

