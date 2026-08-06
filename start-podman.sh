#!/bin/bash
# AutoQAD — Podman startup script
# Runs inside podman-machine-default WSL distro
set -e
export PODMAN_IGNORE_CGROUPSV1_WARNING=1

PROJECT=/mnt/c/Users/sylisiur/Projects/autoQAD/DICOM-Quality-Assurance
cd "$PROJECT"

# Load env vars
set -a
source .env
set +a

NETWORK=autoqad-net

echo "=== AutoQAD Podman Startup ==="

# Create network if needed
podman network exists $NETWORK 2>/dev/null || podman network create $NETWORK

# ─── PostgreSQL ─────────────────────────────────────────────────────────────
if ! podman container exists autoqad-postgres 2>/dev/null; then
  echo "[1/7] Creating PostgreSQL..."
  podman run -d --name autoqad-postgres \
    --network $NETWORK \
    -p 15432:5432 \
    -v autoqad-postgres-data:/var/lib/postgresql/data \
    -e POSTGRES_USER="${DATABASE_USER:-postgres}" \
    -e POSTGRES_PASSWORD="${DATABASE_PASSWORD}" \
    -e POSTGRES_DB="${DATABASE_NAME:-QA-results}" \
    docker.io/library/postgres:16
else
  echo "[1/7] PostgreSQL exists, starting..."
  podman start autoqad-postgres 2>/dev/null || true
fi

# Wait for PostgreSQL
echo "     Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if podman exec autoqad-postgres pg_isready -U "${DATABASE_USER:-postgres}" >/dev/null 2>&1; then
    echo "     PostgreSQL ready"
    break
  fi
  sleep 1
done

# ─── Orthanc ────────────────────────────────────────────────────────────────
if ! podman container exists autoqad-orthanc 2>/dev/null; then
  echo "[2/7] Creating Orthanc..."
  podman run -d --name autoqad-orthanc \
    --network $NETWORK \
    -p 14242:4242 \
    -p 18042:8042 \
    -v autoqad-orthanc-data:/var/lib/orthanc/db \
    -v "$PROJECT/grpc_microservices/Orthanc/orthanc.json":/etc/orthanc/orthanc.json:ro \
    docker.io/jodogne/orthanc-python
else
  echo "[2/7] Orthanc exists, starting..."
  podman start autoqad-orthanc 2>/dev/null || true
fi

# ─── Fetch Service ──────────────────────────────────────────────────────────
if ! podman container exists autoqad-fetch 2>/dev/null; then
  echo "[3/7] Building & creating Fetch Service..."
  podman build -t autoqad-fetch -f "$PROJECT/grpc_microservices/Fetch_service/Containerfile" \
    "$PROJECT/grpc_microservices/Fetch_service"
  podman run -d --name autoqad-fetch \
    --network $NETWORK \
    -p 50051:50051 \
    -e ORTHANC_URL=http://autoqad-orthanc:8042 \
    -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}" \
    -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}" \
    autoqad-fetch
else
  echo "[3/7] Fetch Service exists, starting..."
  podman start autoqad-fetch 2>/dev/null || true
fi

# ─── US Analyze Service ─────────────────────────────────────────────────────
if ! podman container exists autoqad-us-analyze 2>/dev/null; then
  echo "[4/7] Building & creating US Analyze Service..."
  podman build -t autoqad-us-analyze -f "$PROJECT/grpc_microservices/Analyze_service/Containerfile" \
    "$PROJECT/grpc_microservices/Analyze_service"
  podman run -d --name autoqad-us-analyze \
    --network $NETWORK \
    -p 50052:50052 \
    -e DATABASE_HOST=autoqad-postgres -e DATABASE_PORT=5432 \
    -e DATABASE_NAME="${DATABASE_NAME:-QA-results}" \
    -e DATABASE_USER="${DATABASE_USER:-postgres}" \
    -e DATABASE_PASSWORD="${DATABASE_PASSWORD}" \
    -e ORTHANC_URL=http://autoqad-orthanc:8042 \
    -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}" \
    -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}" \
    -e FETCH_SERVICE_HOST=autoqad-fetch:50051 \
    autoqad-us-analyze
else
  echo "[4/7] US Analyze exists, starting..."
  podman start autoqad-us-analyze 2>/dev/null || true
fi

# ─── XR Analyze Service ─────────────────────────────────────────────────────
if ! podman container exists autoqad-xr-analyze 2>/dev/null; then
  echo "[5/7] Building & creating XR Analyze Service..."
  podman build -t autoqad-xr-analyze -f "$PROJECT/grpc_microservices/Xray_analyze_service/Containerfile" \
    "$PROJECT/grpc_microservices/Xray_analyze_service"
  podman run -d --name autoqad-xr-analyze \
    --network $NETWORK \
    -p 50053:50053 \
    -e DATABASE_HOST=autoqad-postgres -e DATABASE_PORT=5432 \
    -e DATABASE_NAME="${DATABASE_NAME:-QA-results}" \
    -e DATABASE_USER="${DATABASE_USER:-postgres}" \
    -e DATABASE_PASSWORD="${DATABASE_PASSWORD}" \
    -e ORTHANC_URL=http://autoqad-orthanc:8042 \
    -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}" \
    -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}" \
    -e FETCH_SERVICE_HOST=autoqad-fetch:50051 \
    autoqad-xr-analyze
else
  echo "[5/7] XR Analyze exists, starting..."
  podman start autoqad-xr-analyze 2>/dev/null || true
fi

# ─── CT Analyze Service ─────────────────────────────────────────────────────
if ! podman container exists autoqad-ct-analyze 2>/dev/null; then
  echo "[6/7] Building & creating CT Analyze Service..."
  podman build -t autoqad-ct-analyze -f "$PROJECT/grpc_microservices/CT_analyze_service/Containerfile" \
    "$PROJECT/grpc_microservices/CT_analyze_service"
  podman run -d --name autoqad-ct-analyze \
    --network $NETWORK \
    -p 50054:50054 \
    -e DATABASE_HOST=autoqad-postgres -e DATABASE_PORT=5432 \
    -e DATABASE_NAME="${DATABASE_NAME:-QA-results}" \
    -e DATABASE_USER="${DATABASE_USER:-postgres}" \
    -e DATABASE_PASSWORD="${DATABASE_PASSWORD}" \
    -e ORTHANC_URL=http://autoqad-orthanc:8042 \
    -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}" \
    -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}" \
    -e FETCH_SERVICE_HOST=autoqad-fetch:50051 \
    autoqad-ct-analyze
else
  echo "[6/7] CT Analyze exists, starting..."
  podman start autoqad-ct-analyze 2>/dev/null || true
fi

# ─── Image Service (US DICOM crop) ──────────────────────────────────────────
if ! podman container exists autoqad-image-service 2>/dev/null; then
  echo "[7/8] Building & creating Image Service..."
  podman build -t autoqad-image-service \
    -f "$PROJECT/grpc_microservices/Image_service/Containerfile" \
    "$PROJECT"
  podman run -d --name autoqad-image-service \
    --network $NETWORK \
    -p 8090:8090 \
    -e ORTHANC_URL=http://autoqad-orthanc:8042 \
    -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}" \
    -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}" \
    autoqad-image-service
else
  echo "[7/8] Image Service exists, starting..."
  podman start autoqad-image-service 2>/dev/null || true
fi

# ─── Go Backend ─────────────────────────────────────────────────────────────
if ! podman container exists autoqad-go-backend 2>/dev/null; then
  echo "[8/8] Building & creating Go Backend..."
  podman build -t autoqad-go-backend -f "$PROJECT/go-backend/Containerfile" \
    "$PROJECT/go-backend"
  podman run -d --name autoqad-go-backend \
    --network $NETWORK \
    -p 8081:8080 \
    -e PORT=8080 \
    -e DATABASE_HOST=autoqad-postgres -e DATABASE_PORT=5432 \
    -e DATABASE_NAME="${DATABASE_NAME:-QA-results}" \
    -e DATABASE_USER="${DATABASE_USER:-postgres}" \
    -e DATABASE_PASSWORD="${DATABASE_PASSWORD}" \
    -e ORTHANC_URL=http://autoqad-orthanc:8042 \
    -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}" \
    -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}" \
    -e IMAGE_SERVICE_URL=http://autoqad-image-service:8090 \
    -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
    -e SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" \
    autoqad-go-backend
else
  echo "[8/8] Go Backend exists, starting..."
  podman start autoqad-go-backend 2>/dev/null || true
fi

echo ""
echo "=== Status ==="
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "React dev server: cd frontend && npm run dev"
echo "Go backend: http://localhost:8081"
echo "Orthanc: http://localhost:18042"
echo "PostgreSQL: localhost:15432"
