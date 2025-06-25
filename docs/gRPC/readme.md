# 🛰️ gRPC Setup Instructions (Python)

This guide describes how to correctly set up a gRPC service and client in Python using a `.proto` file and the `grpcio` tools.

---

## 📁 1. Save your `.proto` file

Create a file called `analyze_service.proto`:

```proto
syntax = "proto3";

service AnalyzeService {
  rpc AnalyzeImage (ImageRequest) returns (AnalysisResult);
}

message ImageRequest {
  string image_path = 1;
}

message AnalysisResult {
  string result = 1;
}
```

## 🧰 2. Install required packages
Install gRPC libraries using pip:

```bash
pip install grpcio grpcio-tools
```

## ⚙️ 3. Generate gRPC Python code from .proto
From the terminal, navigate to the directory containing analyze_service.proto and run:

```bash
python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. analyze_service.proto
```

This will generate: **analyze_service_pb2.py** , **analyze_service_pb2_grpc.py**

These are required to run both server and client.

## 🖥️ 4. Implement the gRPC Server
Create a file called server.py:

```python
from concurrent import futures
import grpc
import analyze_service_pb2
import analyze_service_pb2_grpc

class AnalyzeService(analyze_service_pb2_grpc.AnalyzeServiceServicer):
    def AnalyzeImage(self, request, context):
        print(f"Received request for image: {request.image_path}")
        return analyze_service_pb2.AnalysisResult(result="Image analyzed successfully")

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    analyze_service_pb2_grpc.add_AnalyzeServiceServicer_to_server(AnalyzeService(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("Server started on port 50051.")
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
```

## 🤖 5. Implement the gRPC Client
Create a file called client.py:

```python
import grpc
import analyze_service_pb2
import analyze_service_pb2_grpc

def run():
    channel = grpc.insecure_channel('localhost:50051')
    stub = analyze_service_pb2_grpc.AnalyzeServiceStub(channel)

    request = analyze_service_pb2.ImageRequest(image_path='example.jpg')
    response = stub.AnalyzeImage(request)

    print("Server response:", response.result)

if __name__ == '__main__':
    run()
```
