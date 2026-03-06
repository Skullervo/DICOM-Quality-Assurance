# import grpc
# import analyze_service_pb2
# import analyze_service_pb2_grpc


# # 🔄 Yhdistetään Analyze Serviceen ja asetetaan viestikoko
# options = [
#     ("grpc.max_send_message_length", 200 * 1024 * 1024),
#     ("grpc.max_receive_message_length", 200 * 1024 * 1024),
# ]

# channel = grpc.insecure_channel("localhost:50052", options=options)
# stub = analyze_service_pb2_grpc.AnalyzeServiceStub(channel)

# # 🔹 Vaihda tähän oikea `series_id`
# series_id = "c7d9fd60-b23d3c7c-d12a4c99-d256e73f-148d9b44"

# print(f"📡 Requesting analysis for series ID: {series_id}")
# response = stub.AnalyzeDicomData(analyze_service_pb2.AnalyzeRequest(series_id=series_id))

# # 🔍 Tarkistetaan vastaus
# if response.message == "Analysis complete!":
#     print(f"✅ Analyze onnistui sarjalle: {response.series_id}")
# else:
#     print(f"❌ Analyze epäonnistui: {response.message}")



import grpc
import analyze_service_timed_pb2
import analyze_service_timed_pb2_grpc
import logging

logger = logging.getLogger(__name__)


def main():
	channel = grpc.insecure_channel("localhost:50052")
	stub = analyze_service_timed_pb2_grpc.AnalyzeServiceStub(channel)

	logger.info("📡 Requesting analysis for all series in Orthanc")
	response = stub.AnalyzeAllDicomData(analyze_service_timed_pb2.AnalyzeAllRequest())

	logger.info("✅ Response: %s", response.message)


if __name__ == "__main__":
	logging.basicConfig(level=logging.INFO, format="%(message)s")
	main()
