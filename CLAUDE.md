# CLAUDE.md — AutoQAD Project

## Project Overview

AutoQAD is a distributed cloud-native framework for automated medical image quality assurance (QA) in multi-institutional healthcare environments. It receives DICOM images from hospital PACS, runs modality-specific QA analysis, stores results in PostgreSQL, and presents them via a Django web interface with trend visualization and AI-assisted reporting.

**Publication:** "Cloud-Native Framework for Scalable Medical Image Quality Assurance in Multi-Institutional Healthcare Infrastructures" — Physica Medica (submitted)

## Architecture (7 Layers)

```
1. Reception Layer     → Orthanc DICOM server (receives QA images via DICOM C-STORE)
2. Processing Layer    → Fetch microservice (polls Orthanc) + Analysis microservices (gRPC)
3. Persistence Layer   → PostgreSQL (QA results, DICOM metadata, tolerances)
4. Presentation Layer  → Django web application (dashboards, trend charts, DICOM viewer)
5. Supporting Services → AI assistant (OpenAI GPT), Slack notifications
6. Monitoring Layer    → Prometheus + Grafana + Loki + Promtail
7. Orchestration Layer → Docker containers, Kubernetes (target: CSC cPouta IaaS)
```

## Directory Structure

```
DICOM-Quality-Assurance/
├── client/                          # Django web application
│   ├── autoqad/                     # Django project config
│   │   ├── settings/                # Split settings
│   │   │   ├── __init__.py          # Auto-selects dev/prod via DJANGO_ENV
│   │   │   ├── base.py              # Shared settings
│   │   │   ├── dev.py               # Development (DEBUG=True)
│   │   │   └── prod.py              # Production (SECURE_*, DEBUG=False)
│   │   ├── urls.py                  # Root URL config
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── qa_core/                     # Main Django app (label: 'first_app' for DB compat)
│   │   ├── models.py                # Ultrasound, XrayAnalysis, Transducer, Device,
│   │   │                            #   Institution, ToleranceConfig, AuditLog
│   │   ├── views.py                 # All views and API endpoints
│   │   ├── urls.py                  # App URL routing (prefix: /qa/)
│   │   ├── admin.py                 # Django admin config
│   │   ├── ai_chat.py              # OpenAI GPT integration
│   │   ├── utils.py                 # modifyUS class (US image preprocessing)
│   │   └── management/commands/     # Custom management commands
│   ├── templates/                   # Django HTML templates
│   ├── static/                      # CSS, JS, images
│   │   ├── css/                     # Per-page stylesheets
│   │   ├── js/                      # Chart.js based scripts
│   │   └── images/                  # Modality images, logos
│   ├── .env                         # Environment variables (NOT in git)
│   ├── .env.example                 # Template for .env
│   └── manage.py
│
├── grpc_microservices/
│   ├── Fetch_service/               # Polls Orthanc, serves DICOM via gRPC (port 50051)
│   ├── Analyze_service/             # US QA analysis via gRPC (port 50052)
│   ├── AI/                          # GPT API service
│   ├── Minikube/                    # K8s manifests (postgres, fetch, analyze, secrets)
│   └── VirtualEnvVersion/           # DEPRECATED copy — do not use
│
├── monitoring_stack/                # Loki + Grafana + Prometheus + Promtail
│
└── requirements.txt                 # Python deps (Django 5.2.8, grpcio, pydicom, etc.)
```

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Web framework | Django | 5.2.8 |
| Database | PostgreSQL | 16 |
| DICOM server | Orthanc | latest |
| Microservices | gRPC + protobuf | grpcio 1.70.0 |
| Image processing | pydicom, numpy, scipy, scikit-image, OpenCV | See requirements.txt |
| Charts | Chart.js | 4.4.0 |
| AI assistant | OpenAI GPT | gpt-3.5-turbo |
| Monitoring | Prometheus + Grafana + Loki | See docker-compose |
| Container runtime | Docker + Kubernetes | K8s on CSC cPouta |
| Language | Python 3.12, Finnish UI, English code |

## Key Commands

```bash
# Development server
cd client/
python manage.py runserver

# Database migrations
python manage.py makemigrations
python manage.py migrate
# If migrating existing DB: python manage.py migrate --fake-initial

# Static files
python manage.py collectstatic --noinput

# gRPC services (separate terminals)
cd grpc_microservices/Fetch_service/
python fetch_service.py        # Port 50051

cd grpc_microservices/Analyze_service/
python analyze_service.py      # Port 50052

# Monitoring stack
cd monitoring_stack/
docker-compose up -d
```

## Environment Variables Required

All environment variables are loaded from `client/.env` via python-dotenv.
See `client/.env.example` for the full list.

```bash
# Required in client/.env
DJANGO_ENV=dev                    # dev or prod
DJANGO_SECRET_KEY=<secret>        # Required in prod
DATABASE_NAME=QA-results
DATABASE_USER=postgres
DATABASE_PASSWORD=<secret>
DATABASE_HOST=localhost
DATABASE_PORT=5432
ORTHANC_URL=http://localhost:8042
ORTHANC_USERNAME=admin
ORTHANC_PASSWORD=<secret>
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
OPENAI_API_KEY=sk-...
```

## Database Schema (PostgreSQL "QA-results")

### Existing models
- **Ultrasound** (`ultrasound`): DICOM metadata + QA metrics (s_depth, u_cov, u_skew, u_low, horiz_prof, vert_prof)
- **XrayAnalysis** (`xray_analysis`): DICOM metadata + NORMI-13 phantom metrics
- **Transducer** (`transducers`): Probe lookup table (ROI coordinates)

### New models (Phase 2)
- **Institution** (`institutions`): Healthcare organization registry
- **Device** (`devices`): Imaging device registry (FK → Institution)
- **ToleranceConfig** (`tolerance_configs`): QA metric tolerance limits per device
- **AuditLog** (`audit_log`): Change tracking for traceability

**Note:** Ultrasound model uses legacy column names (`stationname`, `contentdate`).
XrayAnalysis uses snake_case (`station_name`, `content_date`). Harmonization planned.

## URL Structure

```
/                                → Landing page (public)
/admin/                          → Django admin + login
/muokkaa/                        → US data editing table
/qa/                             → App URL namespace (was /first_app/)
  /qa/ultraääni_laadunvalvonta/  → US QA overview
  /qa/institutions/              → US institutions
  /qa/units/                     → US units
  /qa/device/<stationname>/      → US device details + charts
  /qa/xray/institutions/         → X-ray institutions
  /qa/xray/device/<inst>/<unit>/ → X-ray device details
  /qa/api/s_depth/<station>/     → API: US depth data
  /qa/api/xray/uniformity/<st>/  → API: X-ray uniformity data
  /qa/ask-ai/                    → API: AI assistant (POST)
  /qa/api/report-issue/          → API: Slack issue report (POST)
```

## Service Communication

```
Hospital PACS → (DICOM C-STORE) → Orthanc :4242/:8042
                                      ↓
                            Fetch Service :50051 (polls Orthanc REST API)
                                      ↓ (gRPC)
                            Analyze Service :50052 (US/XR/CT analysis)
                                      ↓ (psycopg2)
                              PostgreSQL :5432
                                      ↓
                            Django Web App :8000 (reads DB, serves UI)
                                      ↓
                        User browser ← (Chart.js, DICOM viewer, AI chat)
```

## Supported Modalities

| Modality | Status | Analysis | Phantom |
|----------|--------|----------|---------|
| Ultrasound (US) | Working | In-air reverberation (van Horssen et al.) | No phantom needed |
| X-ray (XR) | Not integrated | NORMI-13 phantom (code exists, pipeline missing) | NORMI-13 |
| CT | Planned | pylinac-based analysis | Catphan 504/600, ACR, Siemens CT phantom |

## Security

All credentials are loaded from environment variables (Phase 1 complete):
- `views.py`: Slack, Orthanc credentials via `os.getenv()`
- `settings.py`: SECRET_KEY, DB credentials via `os.getenv()`
- K8s manifests: Use `secretKeyRef` from `db-credentials` Secret
- All views except `index` require `@login_required`
- CSRF tokens required on POST endpoints
- Production: HTTPS redirect, HSTS, secure cookies enabled via `prod.py`

## Known Issues & Technical Debt

### Architecture
- No `base.html` template — each page duplicates nav/header/footer
- 5 versions of xray device details template (only `_pro.html` is current)
- `VirtualEnvVersion/` is a deprecated copy of microservices
- `analyze_service.py` uses raw SQL instead of Django ORM
- Global `conversation_history` in `ai_chat.py` (memory leak across requests)
- Ultrasound field names not yet harmonized to snake_case

### Pending
- DRF API (serializers, viewsets, pagination) — planned
- X-ray analysis pipeline integration — planned (Phase 3)
- CT analysis with pylinac — planned (Phase 3)
- Testing infrastructure — planned (Phase 5+)

## Coding Conventions

- **Language:** Code in English, UI labels and comments in Finnish
- **Framework:** Django with function-based views (migration to class-based planned)
- **Templates:** Django template language, Chart.js for visualizations
- **API style:** Simple Django views returning JsonResponse (migration to DRF planned)
- **gRPC:** Proto3 syntax, Python generated stubs
- **Naming:** Finnish URL paths (`/ultraääni_laadunvalvonta/`), English model fields
- **Settings:** Split into base/dev/prod, selected via `DJANGO_ENV` env var

## Deployment Target

CSC cPouta (IaaS): 1 control-plane + 2 worker Kubernetes nodes (Ubuntu 22.04).
Kubernetes manifests in `grpc_microservices/Minikube/` (basic, needs production hardening).

## Completed Refactoring Phases

- **Phase 0:** Code cleanup (commented code removal, git cache cleanup)
- **Phase 1:** Security hardening (env vars, CSRF, login_required, K8s secrets)
- **Phase 2:** Backend refactoring (rename ultraSound→autoqad, first_app→qa_core, settings split, new models)
