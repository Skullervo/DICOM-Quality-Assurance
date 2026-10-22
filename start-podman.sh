#!/bin/bash
# Radiqa — Podman startup script (rootless)
# Builds images, creates the network + containers and initialises the database.
# Idempotent: existing containers are (re)started, missing ones are created.
# Run from inside the podman machine / a host with podman + this repo checked out:
#   ./start-podman.sh
#
# SUOMEKSI: start-podman.sh käynnistää koko järjestelmän lokaalistikin Podman-konteilla
# OIKEASSA riippuvuusjärjestyksessä: ensin tietokanta ja Orthanc, sitten hakupalvelu,
# analyysipalvelut ja lopuksi Go-backend. Skripti on idempotentti — jo olemassa olevat
# kontit vain käynnistetään uudelleen, puuttuvat rakennetaan ja luodaan.
# set -e = keskeytä heti jos jokin komento epäonnistuu.
set -e
export PODMAN_IGNORE_CGROUPSV1_WARNING=1

# Repo root = this script's directory (portable, no hard-coded paths)
# Projektin juuri = tämän skriptin hakemisto (ei kovakoodattuja polkuja).
PROJECT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT"

# Load environment variables (.env is git-ignored; copy from .env.example)
# Ladataan ympäristömuuttujat .env-tiedostosta (salasanat ym.). Jos tiedostoa ei ole,
# pysähdytään selkeään virheeseen ja kerrotaan miten se luodaan mallista.
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy it first:  cp .env.example .env  (then edit the values)"
  exit 1
fi
set -a; source .env; set +a

# Yhteinen sisäverkko kaikille konteille; SA = SQL Serverin pääkäyttäjän salasana;
# SQLCMD = valmis komentorivi SQL Serverin ajamiseen kontin sisällä (-C luottaa varmenteeseen).
NETWORK=autoqad-net
SA_PW="${MSSQL_SA_PASSWORD}"
SQLCMD="/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P ${SA_PW} -C"

echo "=== Radiqa Podman startup ==="

# ─── Network ────────────────────────────────────────────────────────────────
# Luo konttiverkko jos sitä ei vielä ole (kontit löytävät toisensa nimellä tässä verkossa).
podman network exists $NETWORK 2>/dev/null || podman network create $NETWORK

# ─── MS SQL Server ──────────────────────────────────────────────────────────
# Tietokanta ensin: luo kontti (host-portti 11433 -> kontin 1433) jos puuttuu,
# muuten vain käynnistä olemassa oleva. Data säilyy nimetyssä volyymissa.
if ! podman container exists autoqad-mssql 2>/dev/null; then
  echo "[1/7] Creating MS SQL Server..."
  podman run -d --name autoqad-mssql --network $NETWORK \
    -p 11433:1433 \
    -v autoqad-mssql-data:/var/opt/mssql \
    -e ACCEPT_EULA=Y \
    -e MSSQL_SA_PASSWORD="${SA_PW}" \
    -e MSSQL_PID=Developer \
    mcr.microsoft.com/mssql/server:2022-latest
else
  echo "[1/7] MS SQL Server exists, starting..."
  podman start autoqad-mssql 2>/dev/null || true
fi

echo "     Waiting for SQL Server..."
# Odotetaan että SQL Server vastaa (enintään ~120 s). Testataan "SELECT 1" -kyselyllä
# 2 s välein, koska kannan käynnistys kestää hetken ennen kuin se hyväksyy yhteyksiä.
for i in $(seq 1 60); do
  if podman exec autoqad-mssql $SQLCMD -Q "SELECT 1" >/dev/null 2>&1; then
    echo "     SQL Server ready"; break
  fi
  sleep 2
done

echo "     Ensuring database + schema..."
# Luo tietokanta jos puuttuu ja aja skeema (taulut). Idempotentti: voi ajaa uudelleen.
podman exec autoqad-mssql $SQLCMD -Q "IF DB_ID('${DATABASE_NAME:-QA-results}') IS NULL CREATE DATABASE [${DATABASE_NAME:-QA-results}]" >/dev/null
podman exec -i autoqad-mssql $SQLCMD -d "${DATABASE_NAME:-QA-results}" < "$PROJECT/scripts/schema_mssql.sql" >/dev/null
echo "     Database ready (analysis_failures + tolerance_config are created by the services on first run)"

# Shared DB env for the services (MSSQL, connect as sa)
# Jaetut ympäristömuuttujat, jotka annetaan kaikille palveluille: DB-yhteys (DB_ENV)
# ja Orthanc-yhteys (ORTHANC_ENV). Palvelut viittaavat toisiinsa KONTTINIMELLÄ
# (esim. autoqad-mssql, autoqad-orthanc), joka toimii sisäverkossa DNS-nimenä.
DB_ENV=(-e DATABASE_HOST=autoqad-mssql -e DATABASE_PORT=1433
        -e DATABASE_NAME="${DATABASE_NAME:-QA-results}"
        -e DATABASE_USER=sa -e DATABASE_PASSWORD="${SA_PW}")
ORTHANC_ENV=(-e ORTHANC_URL=http://autoqad-orthanc:8042
             -e ORTHANC_USERNAME="${ORTHANC_USERNAME:-admin}"
             -e ORTHANC_PASSWORD="${ORTHANC_PASSWORD}")

# ─── Orthanc (DICOM server) ─────────────────────────────────────────────────
# DICOM-palvelin: vastaanottaa kuvat sairaalan PACSista. Portit 14242 (DICOM) ja
# 18042 (web/REST). Konfiguraatio liitetään read-only orthanc.json-tiedostosta.
if ! podman container exists autoqad-orthanc 2>/dev/null; then
  echo "[2/7] Creating Orthanc..."
  podman run -d --name autoqad-orthanc --network $NETWORK \
    -p 14242:4242 -p 18042:8042 \
    -v autoqad-orthanc-data:/var/lib/orthanc/db \
    -v "$PROJECT/grpc_microservices/Orthanc/orthanc.json":/etc/orthanc/orthanc.json:ro \
    docker.io/jodogne/orthanc-python
else
  echo "[2/7] Orthanc exists, starting..."
  podman start autoqad-orthanc 2>/dev/null || true
fi

# ─── Fetch Service ──────────────────────────────────────────────────────────
# Hakupalvelu (gRPC 50051): rakennetaan kuva Containerfilesta ja käynnistetään.
# Pollausmallin palvelu; event-driven-workerit hakevat kuvat Orthancin REST:llä.
if ! podman container exists autoqad-fetch 2>/dev/null; then
  echo "[3/7] Building & creating Fetch Service..."
  podman build -t autoqad-fetch -f "$PROJECT/grpc_microservices/Fetch_service/Containerfile" \
    "$PROJECT/grpc_microservices/Fetch_service"
  podman run -d --name autoqad-fetch --network $NETWORK -p 50051:50051 \
    "${ORTHANC_ENV[@]}" autoqad-fetch
else
  echo "[3/7] Fetch Service exists, starting..."
  podman start autoqad-fetch 2>/dev/null || true
fi

# ─── Analyze services (US / XR / CT) ────────────────────────────────────────
# Apufunktio joka rakentaa ja käynnistää yhden analyysipalvelun. Kolme kutsua alla
# (US/XR/CT) käyttävät samaa logiikkaa, vain nimi, portti ja hakemisto vaihtuvat.
# Kaikille annetaan DB- ja Orthanc-ympäristö + hakupalvelun osoite.
start_analyze() {  # name  port  containerfile-dir
  local name=$1 port=$2 dir=$3
  if ! podman container exists "$name" 2>/dev/null; then
    echo "     Building & creating $name..."
    podman build -t "$name" -f "$PROJECT/$dir/Containerfile" "$PROJECT/$dir"
    podman run -d --name "$name" --network $NETWORK -p "$port:$port" \
      "${DB_ENV[@]}" "${ORTHANC_ENV[@]}" -e FETCH_SERVICE_HOST=autoqad-fetch:50051 "$name"
  else
    echo "     $name exists, starting..."; podman start "$name" 2>/dev/null || true
  fi
}
echo "[4/7] US / XR / CT analyze services..."
start_analyze autoqad-us-analyze 50052 grpc_microservices/Analyze_service
start_analyze autoqad-xr-analyze 50053 grpc_microservices/Xray_analyze_service
start_analyze autoqad-ct-analyze 50054 grpc_microservices/CT_analyze_service

# ─── Image Service (US straighten / crop) ───────────────────────────────────
# Kuvapalvelu (portti 8090): US-kuvien suoristus/rajaus näyttöä varten.
# HUOM: build-konteksti on projektin juuri ("$PROJECT"), koska Containerfile
# viittaa polkuihin grpc_microservices/Image_service/...
if ! podman container exists autoqad-image-service 2>/dev/null; then
  echo "[5/7] Building & creating Image Service..."
  podman build -t autoqad-image-service -f "$PROJECT/grpc_microservices/Image_service/Containerfile" "$PROJECT"
  podman run -d --name autoqad-image-service --network $NETWORK -p 8090:8090 \
    "${ORTHANC_ENV[@]}" autoqad-image-service
else
  echo "[5/7] Image Service exists, starting..."
  podman start autoqad-image-service 2>/dev/null || true
fi

# ─── Go Backend ─────────────────────────────────────────────────────────────
# Go-backend (host-portti 8081 -> kontin 8080): tarjoaa REST-API:n ja React-frontendin.
# Saa DB- ja Orthanc-yhteyden, kuvapalvelun osoitteen sekä OpenAI- ja Slack-avaimet.
if ! podman container exists autoqad-go-backend 2>/dev/null; then
  echo "[6/7] Building & creating Go Backend..."
  podman build -t autoqad-go-backend -f "$PROJECT/go-backend/Containerfile" "$PROJECT/go-backend"
  podman run -d --name autoqad-go-backend --network $NETWORK -p 8081:8080 \
    -e PORT=8080 "${DB_ENV[@]}" "${ORTHANC_ENV[@]}" \
    -e IMAGE_SERVICE_URL=http://autoqad-image-service:8090 \
    -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
    -e SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" \
    autoqad-go-backend
else
  echo "[6/7] Go Backend exists, starting..."
  podman start autoqad-go-backend 2>/dev/null || true
fi

# ─── Monitoring (optional) ──────────────────────────────────────────────────
echo "[7/7] Monitoring stack (optional): see monitoring_stack/compose.yml"

echo ""
echo "=== Status ==="
# Tulosta lopuksi kaikkien konttien tila ja portit, sekä käyttöohjeet (osoitteet).
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Go backend: http://localhost:8081    Orthanc: http://localhost:18042 (admin/${ORTHANC_PASSWORD})"
echo "Frontend (dev): cd frontend && npm run dev   ->   http://localhost:5174"
