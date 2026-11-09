# Radiqa (Automated Medical Imaging Quality Assurance)

![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Podman](https://img.shields.io/badge/Podman-892CA0?style=for-the-badge&logo=podman&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-CC2927?style=for-the-badge&logo=microsoftsqlserver&logoColor=white)

**RadiQA** is a cloud-native, **event-driven** framework for the **automated QA of medical imaging** in multi-institutional healthcare environments. It receives DICOM images from a hospital PACS via Orthanc, runs modality-specific QA analysis (ultrasound, X-ray, CT, angiography), stores the results in Microsoft SQL Server, and presents them through a web app
with trend visualization, editable tolerance limits and AI-assisted reporting.

> **New here?** Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the system fits together,
> then follow *Getting started* below to run it locally.

---

## Contents

1. [What you get](#1-what-you-get)
2. [How it works (in one paragraph)](#2-how-it-works-in-one-paragraph)
3. [Getting started](#3-getting-started)
4. [Loading DICOM data](#4-loading-dicom-data)
5. [Frontend (development)](#5-frontend-development)
6. [Services and ports](#6-services-and-ports)
7. [Repository layout](#7-repository-layout)
8. [Stopping and troubleshooting](#8-stopping-and-troubleshooting)
9. [Security notes](#9-security-notes)

---

## 1. What you get

- **Per-device dashboards**: 
  - PASS\WARN\FAIL evaluation with interactive trend charts per modality (ultrasound, X-ray, CT, angiography).
- **Measurements view**: 
  - every acquisition Orthanc has seen, *including failed analyses*, with the failure reason.
- **Editable acceptance limits**:
  - tolerances live in the database and are editable from the UI.
- **Editable device metadata**: 
  - station / institution / manufacturer / model.
- **AI-assisted reporting**: 
  - ask questions about the QA data (OpenAI GPT).
- **Issue reporting**: 
  - to a Slack channel.

## 2. How it works

1. A study arriving in **Orthanc** triggers a webhook to the **ingestion service**, which creates QA jobs in **SQL Server**. 
2. A **Service Broker** message wakes the matching **event worker** (US / XR / CT / angio), which claims the job atomically, fetches the DICOM over Orthanc REST, analyses it, and writes results to the database (**S3/SeaweedFS**). 
3. The **Go backend** reads the results and serves the **React** app behind a **Caddy** reverse proxy. Full detail:[`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 3. Getting started

The whole backend stack runs as rootless **Podman** containers on one network (`autoqad-net`). `start-podman.sh` builds every image, creates the containers in dependency order and initialises the database, so a fresh install is essentially 
*configure `.env` → run one script → load some DICOM data*.

### 3.1 Prerequisites

- **Podman** (rootless): 
  - the only hard requirement for the container stack; the script builds the Python/Go services in containers.
- **Node.js 20+**: 
  - only to run the React dev server (§5).
- *(Go 1.25+ / Python 3.12+ are needed only if you build a service **outside** containers.)*

### 3.2 Clone and configure

```sh
git clone <your-repo-url> radiqa
cd radiqa
cp .env.example .env          # edit the values — see below
```

Edit `.env` (git-ignored). At minimum set:

| Variable | Needed for | Notes |
|---|---|---|
| `MSSQL_SA_PASSWORD` | database | SQL Server requires ≥ 8 chars incl. upper/lower/digit/symbol |
| `ORTHANC_PASSWORD` | DICOM server | Orthanc web/REST login (user `admin`) |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | object storage | any values; must match on worker + backend (the script wires them automatically) |
| `OPENAI_API_KEY` | AI reporting | optional — leave as placeholder to disable |
| `SLACK_WEBHOOK_URL` | issue reporting | optional |

> `start-podman.sh` reads **this root `.env`** and passes the values to every container. The
> `.env.example` files inside `ingestion-service/`, `go-backend/` and `frontend/` are only
> for running those services standalone.

### 3.3 Windows (WSL2 + Podman)

```powershell
# one-time: install Podman Desktop / podman, then
podman machine init          # once
podman machine start

# start the whole stack (wrapper runs start-podman.sh inside the podman machine)
.\start-autoqad.ps1
```

`start-autoqad.ps1` starts the Podman machine if needed and runs `start-podman.sh` via `podman machine ssh` (the correct rootless context — do **not** use `wsl -d podman-machine-default -- podman …`, which runs Podman in a broken context).

### 3.4 Linux

```sh
./start-podman.sh
```

### 3.5 What comes up

The script is **idempotent**:
- existing containers are just (re)started. 
- It brings up, in order: 
  - **MS SQL Server** (+ creates the `QA-results` database and applies the schemas) →
  - **object storage** (SeaweedFS) → 
  - **Orthanc** (+ ingestion webhook plugin) → 
  - **ingestion service** → 
  - **image service** → 
  - **event workers** → 
  - **Go backend** → 
  - **Caddy** reverse proxy. 
- Monitoring (Prometheus/Grafana/Loki) is optional (`monitoring_stack/compose.yml`).

### 3.6 Verify

```sh
curl http://localhost:8081/Laadunhallinta/api/us/institutions   # Go backend (direct)
curl http://localhost:8070/health                                # ingestion
```
- Orthanc Explorer: `http://localhost:18042` (login `admin` / your `ORTHANC_PASSWORD`)
- Via Caddy proxy: `http://localhost:8080` / `https://localhost:8443` (self-signed CA)

---

### 3.7 Distributed deployment (Kubernetes / CSC cPouta)

The single-node Podman stack above is the quickest way to run RadiQA. The system has also been validated **distributed on a Kubernetes cluster (CSC cPouta)**: the event schema, Service Broker, object storage and competing-consumer workers scale across nodes. The Kubernetes manifests live in `services/Minikube/cpouta/`.

> **Full distributed setup instructions will be added to this file later.**


## 4. Loading DICOM data

Analysis only runs on data that has reached Orthanc. When a study becomes **stable**, the ingestion webhook fires automatically and the matching worker analyses it.

**A) From the hospital PACS (C-STORE)** (point the PACS at Orthanc):
- Host: the Orthanc server, **DICOM port `14242`** (container port 4242)
- AE Title: `ORTHANC`

**B) Upload test images manually** (Orthanc Explorer:`http://localhost:18042` → *Upload*), or via REST:
```sh
curl -u admin:$ORTHANC_PASSWORD --data-binary @image.dcm \
     -H "Content-Type: application/dicom" http://localhost:18042/instances
```

---

## 5. Frontend (development)

```sh
cd frontend
npm install
npm run dev        # http://localhost:5174
```
The Vite dev server proxies `/Laadunhallinta/api` to the Go backend. The login gate defaults to `admin` / `radiqa` (override with `VITE_LOGIN_USER` / `VITE_LOGIN_PASSWORD` in `frontend/.env`). In production the React app is built into the Go backend image and served by it, no separate frontend container.

---

## 6. Services and ports

Ports shown as `host → container`. The **host** side of every port is set in `.env` (defaults below):
- change it only if a port is already in use on your machine 
- see *Changing a port* under the table.

| Service | Port | Container image |
|---|---|---|
| MS SQL Server | 11433 → 1433 | `mcr.microsoft.com/mssql/server:2022-latest` |
| Object storage (SeaweedFS, S3) | 8333 | `chrislusf/seaweedfs` |
| Orthanc (DICOM / REST) | 14242 → 4242 / 18042 → 8042 | `jodogne/orthanc-python` |
| Ingestion service | 8070 → 8000 | built from `ingestion-service/` |
| Image service | 8090 → 8090 | built from `services/Image_service/` |
| US / XR / CT / angio workers | internal | built from each `services/*_service/` |
| Go backend | 8081 → 8080 | built from `go-backend/` |
| Caddy reverse proxy | 8080 (HTTP) / 8443 (HTTPS) | `caddy:2-alpine` |
| React dev server (Vite) | 5174 | — (dev only) |
| Prometheus / Grafana (optional) | 9090 / 3000 | `monitoring_stack/` |

### Changing a port (if one is already in use)

Every host port has a variable in `.env` with the default shown above. 
- If a port is already taken on your machine, pick a free one and set the matching variable **before** running `start-podman.sh`

| `.env` variable | Default | Service |
|---|---|---|
| `MSSQL_HOST_PORT` | 11433 | MS SQL Server |
| `ORTHANC_DICOM_HOST_PORT` | 14242 | Orthanc DICOM (C-STORE) |
| `ORTHANC_REST_HOST_PORT` | 18042 | Orthanc REST / Explorer |
| `INGESTION_HOST_PORT` | 8070 | Ingestion service |
| `IMAGE_HOST_PORT` | 8090 | Image service |
| `S3_HOST_PORT` | 8333 | Object storage (SeaweedFS) |
| `GO_HOST_PORT` | 8081 | Go backend (direct) |
| `CADDY_HTTP_PORT` | 8080 | Caddy HTTP (main browser entry point) |
| `CADDY_HTTPS_PORT` | 8443 | Caddy HTTPS |

Only the **host** side changes
- container-internal ports and container-to-container addresses are fixed, so nothing else needs editing. 

Find a free port with
- `netstat -ano | findstr :8080` (Windows) or `ss -ltnp | grep 8080` (Linux). 
- On startup the script prints the final URLs for whatever ports you chose.

> If you also run the Vite **dev server** (§5) and change `GO_HOST_PORT`, update the proxy
> target in `frontend/vite.config.ts` to match. The containerised stack does not need this —
> the Go backend serves the built React app itself.

---

## 7. Repository layout

```
.
├── ARCHITECTURE.md             # system architecture (start here)
├── start-podman.sh             # brings up the whole stack (Linux / podman machine)
├── start-autoqad.ps1           # Windows wrapper (runs the above in the podman machine)
├── stop-autoqad.ps1            # stops the stack
├── go-backend/                 # Go API + serves the React SPA
├── frontend/                   # React + Vite + TypeScript SPA
├── ingestion-service/          # FastAPI webhook → QA jobs (event entry point)
├── services/         # Python analysis services (see note below)
│   ├── Analyze_service/              # ultrasound  (worker_us_eventdriven.py)
│   ├── Xray_analyze_service/         # NORMI-13    (worker_xr_eventdriven.py)
│   ├── CT_analyze_service/           # CatPhan     (worker_ct_eventdriven.py)
│   ├── Angio_analyze_service/        # Leeds TOR-18 (worker_angio_eventdriven.py)
│   ├── Image_service/                # US straighten / crop
│   ├── Orthanc/                      # orthanc.json
│   ├── AI/                           # OpenAI GPT integration
│   └── Minikube/                     # Kubernetes manifests (incl. cpouta/)
├── scripts/                    # DB schema + migrations + backfills
├── caddy/                      # reverse proxy config
└── monitoring_stack/           # Prometheus + Grafana + Loki (optional)
```


---

## 8. Stopping and troubleshooting

```powershell
.\stop-autoqad.ps1            # stop the containers (data is kept in volumes)
.\stop-autoqad.ps1 -Machine   # also stop the podman machine (frees RAM)
```

- **Containers don't come back after a reboot** 
  - they have no restart policy; run `start-autoqad.ps1` again (it re-starts existing containers in the right order).
- **SQL Server slow to accept connections on first boot** 
  - it recovers the database.
  - `start-podman.sh` waits up to ~120 s.
- On Windows, data lives in named Podman volumes (`autoqad-mssql-data`,
  `autoqad-orthanc-data`, `autoqad-s3-data`, …) and survives restarts.

---

## 9. Security notes

- All secrets are read from environment variables / `.env` files, which are **git-ignored**. Never commit a real `.env`. Production uses Kubernetes Secrets.
- The web login is a **lightweight front-end gate** (UI only); it does **not** protect the API yet. Backend authentication is a planned, pre-deployment enhancement.
- A dedicated **threat model, security test plan and hardening notes** live in a separate **private** security repository. See `WP0_THREAT_MODEL.md` there for the detailed threat modelling (STRIDE + DFD, OWASP Top 10), the test plan, and the hardening measures.
- Security testing is run only against a local instance with synthetic / phantom data, never patient data.


