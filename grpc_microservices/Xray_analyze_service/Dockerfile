FROM python:3.12-slim

WORKDIR /app

# Asenna järjestelmäriippuvuudet
# git: normi13-qa-paketti asennetaan GitHubista
# libGL + libglib: OpenCV tarvitsee headless-tilassa
# libpq-dev + gcc: psycopg2-binary käännöstä varten
RUN apt-get update && apt-get install -y --no-install-recommends \
    git gcc libpq-dev libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generoi gRPC-stubit
RUN python -m grpc_tools.protoc \
    -I. \
    --python_out=. \
    --grpc_python_out=. \
    xray_analyze_service.proto

EXPOSE 50053

CMD ["python", "xray_analyze_service.py"]
