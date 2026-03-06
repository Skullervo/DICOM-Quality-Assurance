FROM python:3.12-slim

WORKDIR /app

# Asenna järjestelmäriippuvuudet (psycopg2, matplotlib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generoi gRPC-stubit
RUN python -m grpc_tools.protoc \
    -I. \
    --python_out=. \
    --grpc_python_out=. \
    ct_analyze_service.proto

EXPOSE 50054

CMD ["python", "ct_analyze_service.py"]
