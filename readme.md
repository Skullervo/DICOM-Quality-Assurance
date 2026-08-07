# Radiqa — Automated Medical Imaging Quality Assurance

![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-4285F4?style=for-the-badge&logo=grpc&logoColor=white)
![Podman](https://img.shields.io/badge/Podman-892CA0?style=for-the-badge&logo=podman&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-CC2927?style=for-the-badge&logo=microsoftsqlserver&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)

**Radiqa** is a cloud-native framework for **automated QA of medical
images** in multi-institutional healthcare environments. It receives DICOM images from
hospital PACS via Orthanc, runs modality-specific QA analysis (ultrasound, X-ray, CT),
stores the results, and presents them through a web app with trend visualization,
tolerance management and AI-assisted reporting.

---

## Contents

1. [Architecture](#1-architecture)
2. [Features](#2-features)
3. [Supported modalities](#3-supported-modalities)
4. [Tech stack](#4-tech-stack)
5. [Services and ports](#5-services-and-ports)
6. [Getting started](#6-getting-started)
7. [Project structure](#7-project-structure)
8. [Security notes](#8-security-notes)
9. [Status and roadmap](#9-status-and-roadmap)

---

## 1. Architecture

```
Hospital PACS ──(DICOM C-STORE)──▶ Orthanc
                                     │
                          Fetch Service :50051 (polls Orthanc)
                                     │ gRPC
        ┌───────────────┬───────────┴───────────┬───────────────┐
   US-Analyze       XR-Analyze              CT-Analyze      Image Service
    :50052            :50053                  :50054           :8090
        └───────────────┴───────────┬───────────┴───────────────┘
                                     │ (results)
                              MS SQL Server  (QA-results)
                                     │
                              Go Backend :8080   ── /Laadunhallinta/api/*
                                     │
                              React SPA (Radiqa) ── /Laadunhallinta/*
                                     │
                                User browser

Monitoring: Prometheus + Grafana + Loki     Orchestration: Podman (rootless) / Kubernetes
```

Each analyze service is decentralized: it polls all Orthanc series and **self-filters by
DICOM `Modality`** (US → `US`, XR → `CR`/`DX`, CT → `CT`) — there is no central dispatcher.

---

## 2. Features

- **Per-device dashboards** — pass/fail evaluation, interactive trend charts per modality.
- **Measurements view** — every measurement Orthanc has seen, *including failed
  analyses*, with the failure reason and traceback.
- **Editable acceptance limits** — tolerances live in the database, editable from the UI.
- **Editable device metadata** — station/institution/manufacturer/model.
- **AI-assisted reporting** — ask questions about the QA data (OpenAI GPT).
- **Issue reporting** — one-click report to Slack.
- **Login gate + intro** — lightweight front-end authentication.

---

## 3. Supported modalities

| Modality | Analysis | Phantom |
|---|---|---|
| **Ultrasound (US)** | In-air reverberation (van Horssen et al. 2017); convex & sector probe straightening | none |
| **X-ray (XR)** | NORMI-13 via `normi13_qa` (pylinac): PIU uniformity, Cu wedge, low-contrast CNR/SNR, MTF | NORMI-13 |
| **CT** | pylinac CatPhan 504/600 (auto-detected): HU linearity, uniformity/noise, MTF, low-contrast; | Catphan |

---

## 4. Tech stack

- **Backend:** Go, gRPC client to the Python services
- **Frontend:** React + Vite + TypeScript
- **Analysis services:** Python + gRPC
- **DICOM server:** Orthanc
- **Database:** Microsoft SQL Server
- **Monitoring:** Prometheus + Grafana + Loki
- **Runtime:** Podman on network `autoqad-net`; Kubernetes/Minikube manifests

---

## 5. Services and ports

| Service | Port (container) | Port (host) |
|---|---|---|
| Fetch service | 50051 | 50051 |
| US analyze | 50052 | 50052 |
| XR analyze | 50053 | 50053 |
| CT analyze | 50054 | 50054 |
| Image service | 8090 | 8090 |
| Go backend | 8080 | 8081 |
| React dev server (Vite) | — | 5174 |
| Orthanc | 8042 | 18042 |
| MS SQL Server | 1433 | 11433 |
| PostgreSQL (legacy) | 5432 | 15432 |
| Prometheus | 9090 | 9090 |
| Grafana | 3000 | 3000 |

---

## 6. Getting started

### 6.1 Prerequisites
- Podman with a `podman-machine` (Windows/WSL) or native Linux
- Node.js 20+ (frontend), Go 1.23+ (backend), Python 3.12+ (analysis services)

### 6.2 Configure environment
Copy the examples and fill in your own values (never commit real secrets — `.env` is
git-ignored):

```sh
cp .env.example .env                   # backend / services
cp frontend/.env.example frontend/.env # frontend (login gate, API base)
```

### 6.3 Start the stack (Podman)
```sh
./start-podman.sh          # Linux / WSL
# or on Windows:
.\start-autoqad.ps1
```
This brings up Orthanc, MS SQL Server, the fetch/analyze/image services, the Go backend
and the monitoring stack on the `autoqad-net` network. See
[`palvelimen_kaynnistys.md`](palvelimen_kaynnistys.md) for the full startup guide and
troubleshooting.

### 6.4 Frontend (development)
```sh
cd frontend
npm install
npm run dev        # http://localhost:5174
```
The app is served under `/Laadunhallinta/`. The dev login gate defaults to `admin` /
`radiqa` (configurable via `VITE_LOGIN_USER` / `VITE_LOGIN_PASSWORD`).

---

## 7. Project structure

```
.
├── go-backend/          # Go API + serves the React SPA (/Laadunhallinta/api/*)
├── frontend/            # React + Vite SPA (Radiqa)
├── grpc_microservices/  # Python gRPC analysis services
│   ├── Fetch_service/        # polls Orthanc                    (:50051)
│   ├── Analyze_service/      # ultrasound                       (:50052)
│   ├── Xray_analyze_service/ # NORMI-13                         (:50053)
│   ├── CT_analyze_service/   # CatPhan                          (:50054)
│   ├── Image_service/        # US straightening / cropping      (:8090)
│   ├── AI/                   # OpenAI GPT integration
│   └── Minikube/             # Kubernetes manifests
├── monitoring_stack/    # Prometheus + Grafana + Loki
└── scripts/             # DB migration (PG→MSSQL), backfills, startup
```

---

## 8. Security notes

- All secrets are read from environment variables / `.env` files, which are **git-ignored**.
- The web login is a **lightweight front-end gate** (UI-only) — it does not protect the
  API. Real authentication (backend session/JWT) is a planned enhancement.

---

## 9. Status and roadmap

- ✅ US / XR / CT analysis, Orthanc DICOM server, results storage
- ✅ Go + React presentation layer
- ✅ Prometheus + Grafana + Loki monitoring
- ✅ MS SQL database
