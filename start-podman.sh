#!/bin/bash
# Radiqa — Podman startup script (rootless), EVENT-DRIVEN model.
# Builds images, creates the network + containers and initialises the database.
# Idempotent: existing containers are (re)started, missing ones are created.
#   ./start-podman.sh
#
# SUOMEKSI: start-podman.sh käynnistää koko järjestelmän lokaalisti Podman-konteilla
# OIKEASSA riippuvuusjärjestyksessä. Tämä versio käyttää EVENT-DRIVEN-mallia (ei
# legacy-pollereita): Orthanc-webhook -> ingestion -> MS SQL Service Broker -> event-
# workerit (us/xr/ct/angio) -> analyysi -> tulokset DB:hen + kuvat S3:een (SeaweedFS).
# Skripti on idempotentti — olemassa olevat kontit vain käynnistetään, puuttuvat luodaan.
# set -e = keskeytä heti jos jokin komento epäonnistuu.
set -e
export PODMAN_IGNORE_CGROUPSV1_WARNING=1

# Projektin juuri = tämän skriptin hakemisto (ei kovakoodattuja polkuja).
PROJECT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT"

# Ladataan ympäristömuuttujat .env:stä (salasanat, S3-tunnukset ym.).
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy it first:  cp .env.example .env  (then edit the values)"
  exit 1
fi
# tr -d '\r': siivoa CR jos .env on tallennettu CRLF-rivinvaihdoilla (Windows-editori).
# Muuten esim. S3_SECRET_KEY saisi perään '\r' -> generoitu s3config.json rikkoutuu ja
# SeaweedFS kaatuu ("invalid character '\r' in string") -> koko S3/objektivarasto nurin.
set -a; source <(tr -d '\r' < .env); set +a

# Yhteinen sisäverkko; SA = SQL Serverin salasana; SQLCMD = valmis sqlcmd kontin sisällä.
NETWORK=autoqad-net
SA_PW="${MSSQL_SA_PASSWORD}"
SQLCMD="/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P ${SA_PW} -C"

echo "=== Radiqa Podman startup (event-driven) ==="

# ─── Network ────────────────────────────────────────────────────────────────
podman network exists $NETWORK 2>/dev/null || podman network create $NETWORK

# ─── MS SQL Server ──────────────────────────────────────────────────────────
# Tietokanta ensin (host 11433 -> kontti 1433). Data säilyy nimetyssä volyymissa.
if ! podman container exists autoqad-mssql 2>/dev/null; then
  echo "[1/8] Creating MS SQL Server..."
  podman run -d --name autoqad-mssql --network $NETWORK \
    -p ${MSSQL_HOST_PORT:-11433}:1433 \
    -v autoqad-mssql-data:/var/opt/mssql \
    -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD="${SA_PW}" -e MSSQL_PID=Developer \
    mcr.microsoft.com/mssql/server:2022-latest
else
  echo "[1/8] MS SQL Server exists, starting..."
  podman start autoqad-mssql 2>/dev/null || true
fi

echo "     Waiting for SQL Server..."
# Odota että SQL Server hyväksyy yhteyksiä (enintään ~120 s).
for i in $(seq 1 60); do
  if podman exec autoqad-mssql $SQLCMD -Q "SELECT 1" >/dev/null 2>&1; then
    echo "     SQL Server ready"; break
  fi
  sleep 2
done

echo "     Ensuring database + schemas..."
DB="${DATABASE_NAME:-QA-results}"
podman exec autoqad-mssql $SQLCMD -Q "IF DB_ID('$DB') IS NULL CREATE DATABASE [$DB]" >/dev/null
# Odota että tietokanta on ONLINE. Rebootin jälkeen SQL Server hyväksyy yhteyksiä
# (master vastaa) mutta QA-results voi olla vielä RECOVERING -> skeeman sovellus
# kaatuisi "Cannot open database". Odotetaan enintään ~120 s.
for _i in $(seq 1 60); do
  _st=$(podman exec autoqad-mssql $SQLCMD -h -1 -W -Q "SET NOCOUNT ON; SELECT state_desc FROM sys.databases WHERE name='$DB'" 2>/dev/null | tr -d '[:space:]')
  [ "$_st" = "ONLINE" ] && break
  sleep 2
done
# Tulostaulut + event-driven-koordinaatio (Service Broker + job-taulut) + angio-taulu.
podman exec -i autoqad-mssql $SQLCMD -d "$DB" < "$PROJECT/scripts/schema_mssql.sql" >/dev/null
podman exec -i autoqad-mssql $SQLCMD -d "$DB" < "$PROJECT/scripts/schema_eventdriven.sql" >/dev/null
podman exec -i autoqad-mssql $SQLCMD -d "$DB" < "$PROJECT/scripts/schema_angio.sql" >/dev/null
echo "     Database + event-driven schema ready (tolerance_config seeded by go-backend)"

# Jaetut ympäristömuuttujat palveluille: DB, Orthanc ja S3 (objektivarasto).
DB_ENV=(-e DATABASE_HOST=autoqad-mssql -e DATABASE_PORT=1433
        -e DATABASE_NAME="$DB" -e DATABASE_USER=sa -e DATABASE_PASSWORD="${SA_PW}")
ORTHANC_ENV=(-e ORTHANC_URL=http://autoqad-orthanc:8042
             -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}"
             -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}")
S3_ENV=(-e S3_ENDPOINT="${S3_ENDPOINT:-http://object-storage:8333}"
        -e S3_BUCKET="${S3_BUCKET:-qa-outputs}"
        -e S3_ACCESS_KEY="${S3_ACCESS_KEY}" -e S3_SECRET_KEY="${S3_SECRET_KEY}")

# ─── Object storage (SeaweedFS, S3-yhteensopiva) ────────────────────────────
# US- ja angio-analyysikuvat tallennetaan tänne (S3). Generoidaan s3config.json
# .env:n tunnuksista (salaisuus pysyy .env:ssä), ja ajetaan SeaweedFS (portti 8333).
echo "[2/8] Object storage (SeaweedFS)..."
mkdir -p "$PROJECT/object-storage"
cat > "$PROJECT/object-storage/s3config.json" <<EOF
{ "identities": [ { "name": "autoqad",
    "credentials": [ { "accessKey": "${S3_ACCESS_KEY}", "secretKey": "${S3_SECRET_KEY}" } ],
    "actions": ["Admin","Read","Write","List","Tagging"] } ] }
EOF
if ! podman container exists object-storage 2>/dev/null; then
  podman run -d --name object-storage --network $NETWORK -p ${S3_HOST_PORT:-8333}:8333 \
    -v "$PROJECT/object-storage/s3config.json":/etc/seaweedfs/s3config.json:ro \
    -v autoqad-s3-data:/data \
    docker.io/chrislusf/seaweedfs:latest \
    server -dir=/data -s3 -s3.config=/etc/seaweedfs/s3config.json -ip.bind=0.0.0.0
else
  podman start object-storage 2>/dev/null || true
fi

# ─── Orthanc (DICOM server) + ingestion-webhook ─────────────────────────────
# DICOM-palvelin. Portit 14242 (DICOM) ja 18042 (REST). Mountataan orthanc.json JA
# autoqad_ingest.py (Python-plugin), joka StableStudy-tapahtumassa POSTaa ingestioniin.
if ! podman container exists autoqad-orthanc 2>/dev/null; then
  echo "[3/8] Creating Orthanc (+ ingestion webhook)..."
  podman run -d --name autoqad-orthanc --network $NETWORK \
    -p ${ORTHANC_DICOM_HOST_PORT:-14242}:4242 -p ${ORTHANC_REST_HOST_PORT:-18042}:8042 \
    -v autoqad-orthanc-data:/var/lib/orthanc/db \
    -v "$PROJECT/services/Orthanc/orthanc.json":/etc/orthanc/orthanc.json:ro \
    -v "$PROJECT/ingestion-service/orthanc/autoqad_ingest.py":/etc/orthanc/autoqad_ingest.py:ro \
    -e INGESTION_URL=http://ingestion-service:8000/webhook/study \
    docker.io/jodogne/orthanc-python
else
  echo "[3/8] Orthanc exists, starting..."
  podman start autoqad-orthanc 2>/dev/null || true
fi

# ─── Ingestion service (event-driven sisääntulo) ────────────────────────────
# FastAPI (portti 8070->8000): ottaa Orthancin webhookin ja luo QA-jobit job-tauluihin.
if ! podman container exists ingestion-service 2>/dev/null; then
  echo "[4/8] Building & creating Ingestion service..."
  podman build -t autoqad-ingestion -f "$PROJECT/ingestion-service/Containerfile" "$PROJECT/ingestion-service"
  podman run -d --name ingestion-service --network $NETWORK -p ${INGESTION_HOST_PORT:-8070}:8000 \
    "${ORTHANC_ENV[@]}" "${DB_ENV[@]}" autoqad-ingestion
else
  echo "[4/8] Ingestion service exists, starting..."
  podman start ingestion-service 2>/dev/null || true
fi

# ─── Image Service (US straighten / crop) ───────────────────────────────────
# Kuvapalvelu (8090): US-kuvien suoristus/rajaus näyttöä varten. Go-backend käyttää.
# HUOM: build-konteksti on projektin juuri ("$PROJECT").
if ! podman container exists autoqad-image-service 2>/dev/null; then
  echo "[5/8] Building & creating Image Service..."
  podman build -t autoqad-image-service -f "$PROJECT/services/Image_service/Containerfile" "$PROJECT"
  podman run -d --name autoqad-image-service --network $NETWORK -p ${IMAGE_HOST_PORT:-8090}:8090 \
    "${ORTHANC_ENV[@]}" autoqad-image-service
else
  echo "[5/8] Image Service exists, starting..."
  podman start autoqad-image-service 2>/dev/null || true
fi

# ─── Event workers (US / XR / CT / Angio) ───────────────────────────────────
# Korvaa legacy-pollerit. Kukin worker varaa jobit omasta job-taulustaan (Service
# Broker -herätyksellä), hakee DICOMin Orthancin REST:llä, analysoi ja kirjoittaa
# tulokset + kuvat (US/angio -> S3). US/XR/CT käyttävät analyze-imagea CMD-overridella;
# angiolla on oma image (sen Containerfile ajaa workerin oletuksena).
echo "[6/8] Event workers..."
# Siivoa mahdolliset legacy-poller-kontit pois (cutover event-driveniin).
for legacy in autoqad-us-analyze autoqad-xr-analyze autoqad-ct-analyze autoqad-fetch; do
  podman rm -f "$legacy" >/dev/null 2>&1 || true
done
# build-if-missing: rakentaa worker-imagen (jaettu analyze-image) tarvittaessa.
build_img() { # image  dir
  podman image exists "$1" 2>/dev/null || \
    podman build -t "$1" -f "$PROJECT/$2/Containerfile" "$PROJECT/$2"
}
run_worker() { # worker-name  image  [python script]
  local name=$1 image=$2; shift 2
  if ! podman container exists "$name" 2>/dev/null; then
    podman run -d --name "$name" --network $NETWORK \
      "${DB_ENV[@]}" "${ORTHANC_ENV[@]}" "${S3_ENV[@]}" "$image" "$@"
  else
    podman start "$name" 2>/dev/null || true
  fi
}
build_img autoqad-us-analyze    services/Analyze_service
build_img autoqad-xr-analyze    services/Xray_analyze_service
build_img autoqad-ct-analyze    services/CT_analyze_service
build_img autoqad-angio-analyze services/Angio_analyze_service
run_worker us-worker    autoqad-us-analyze    python worker_us_eventdriven.py
run_worker xr-worker    autoqad-xr-analyze    python worker_xr_eventdriven.py
run_worker ct-worker    autoqad-ct-analyze    python worker_ct_eventdriven.py
run_worker angio-worker autoqad-angio-analyze           # angio-image ajaa workerin oletus-CMD:llä

# ─── Go Backend ─────────────────────────────────────────────────────────────
# Go-backend (host 8081 -> kontti 8080): REST-API + React. Saa DB/Orthanc/S3-yhteyden,
# kuvapalvelun osoitteen sekä OpenAI- ja Slack-avaimet.
if ! podman container exists autoqad-go-backend 2>/dev/null; then
  echo "[7/8] Building & creating Go Backend..."
  # Build-konteksti = projektin juuri (Containerfile rakentaa myös frontendin);
  # .containerignore rajaa kontekstin go-backend/- ja frontend/-lähteisiin.
  podman build -t autoqad-go-backend -f "$PROJECT/go-backend/Containerfile" \
    --ignorefile "$PROJECT/go-backend/.containerignore" "$PROJECT"
  podman run -d --name autoqad-go-backend --network $NETWORK -p ${GO_HOST_PORT:-8081}:8080 \
    -e PORT=8080 "${DB_ENV[@]}" "${ORTHANC_ENV[@]}" "${S3_ENV[@]}" \
    -e IMAGE_SERVICE_URL=http://autoqad-image-service:8090 \
    -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
    -e SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" \
    autoqad-go-backend
else
  echo "[7/8] Go Backend exists, starting..."
  podman start autoqad-go-backend 2>/dev/null || true
fi

# ─── Caddy reverse proxy (lokaali, vastaa tuotannon Caddya) ──────────────────
# Topologia: selain -> Caddy (host :8080 HTTP / :8443 HTTPS) -> autoqad-go-backend:8080.
# Lisätty tietoturvaprojektia varten (TLS + proxy-taso testattavaksi lokaalisti).
# HUOM: go-backend pysyy MYÖS suoraan auki :8081:ssä (vertailu: direct vs. proxy).
# HTTPS käyttää Caddyn sisäistä CA:ta; data (CA-juuri) säilyy autoqad-caddy-data-volumessa.
if ! podman container exists autoqad-caddy 2>/dev/null; then
  echo "[+] Creating Caddy reverse proxy..."
  podman run -d --name autoqad-caddy --network $NETWORK \
    -p ${CADDY_HTTP_PORT:-8080}:${CADDY_HTTP_PORT:-8080} -p ${CADDY_HTTPS_PORT:-8443}:${CADDY_HTTPS_PORT:-8443} \
    -e CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-8080}" -e CADDY_HTTPS_PORT="${CADDY_HTTPS_PORT:-8443}" \
    -v "$PROJECT/caddy/Caddyfile":/etc/caddy/Caddyfile:ro \
    -v autoqad-caddy-data:/data \
    docker.io/library/caddy:2-alpine
else
  echo "[+] Caddy exists, starting..."
  podman start autoqad-caddy 2>/dev/null || true
fi

# ─── Monitoring (optional) ──────────────────────────────────────────────────
echo "[8/8] Monitoring stack (optional): see monitoring_stack/compose.yml"

echo ""
echo "=== Status ==="
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Go backend (direct): http://localhost:${GO_HOST_PORT:-8081}    Orthanc: http://localhost:${ORTHANC_REST_HOST_PORT:-18042} (admin/${ORTHANC_PASSWORD})"
echo "Caddy proxy: http://localhost:${CADDY_HTTP_PORT:-8080}  /  https://localhost:${CADDY_HTTPS_PORT:-8443}  -> go-backend (TLS: Caddyn sisäinen CA)"
echo "Object storage (S3): http://localhost:${S3_HOST_PORT:-8333}    Ingestion: http://localhost:${INGESTION_HOST_PORT:-8070}/health"
echo "Frontend (dev): cd frontend && npm run dev   ->   http://localhost:5174"
