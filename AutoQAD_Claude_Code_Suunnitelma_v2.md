# AutoQAD – Claude Code Agenttitiimi & Auditointiraportti v2

## Koodikatsauksen yhteenveto

Olen nyt käynyt läpi koko projektin rakenteen ja koodin. Alla konkreettiset havainnot ja päivitetty suunnitelma.

---

## AUDITOINTI: Kriittiset havainnot

### 🔴 Tietoturva (KRIITTINEN)

| Havainto | Tiedosto | Rivi |
|----------|----------|------|
| Slack webhook URL kovakoodattu | `views.py` | 31 |
| Orthanc-salasana kovakoodattu (`alice`) | `views.py` | 38 |
| PostgreSQL-salasana kovakoodattu (`pohde24`) | `analyze_service.py` | 39 |
| K8s-manifesteissa salasanat selkotekstinä | `analyze-deployment.yaml` | 29-30 |
| `@csrf_exempt` useissa endpointeissa | `views.py` | 484, 784 |
| OpenAI API key `.env`:stä – OK, mutta ei `.env.example` | `ai_chat.py` | 6 |
| Ei autentikaatiota API-endpointeissa | `views.py` | kaikki |

### 🟡 Arkkitehtuuri

| Havainto | Selitys |
|----------|---------|
| Ei `base.html` -template | Jokainen sivu määrittelee nav/header/footer erikseen → duplikaattia |
| Useita versioita samasta templatesta | `xray_deviceDetails.html`, `_improved`, `_modern`, `_new`, `_pro` (5 kpl) |
| Useita versioita samasta CSS:stä | `stylesDeviceDetails.css`, `2.css`, `3.css` |
| Django settings puuttuu kokonaan zipistä | Ei `settings.py`, `wsgi.py`, `asgi.py` – oletettavasti `ultraSound/` -kansiossa? |
| `VirtualEnvVersion/` duplikaatti koodista | `grpc_microservices/VirtualEnvVersion/` sisältää kopion palveluista |
| `__pycache__` gitissä | Ei `.gitignore`-sääntöä `.pyc`-tiedostoille |
| `staticfiles/` gitissä (1.5M) | `collectstatic`-tuloste ei kuulu versionhallintaan |
| `requirements.txt` UTF-16 koodattu | Välilyöntejä jokaisen merkin välissä – toimii mutta epätavallinen |

### 🟡 Koodin laatu

| Havainto | Tiedosto |
|----------|----------|
| `print()`-debuggausta tuotantokoodissa | `views.py` rr. 59, 82, 788, 845-846, 866, 869, 871 |
| 250+ riviä kommentoitua koodia | `views.py` rr. 567-684 |
| Duplikoitua DICOM→RGB-muunnoslogiikkaa | `views.py`: `dicom_to_uint8_rgb()` ja `dicom_to_uint8_rgb_xray()` ovat lähes identtisiä |
| `conversation_history` globaali muuttuja AI-chatissa | `ai_chat.py` r. 16 – muisti vuotaa prosessien välillä |
| Ei virhekäsittelyn yhtenäisyyttä | Osassa try/except, osassa ei |
| `from first_app import views` + `from . import views` | `urls.py` r. 1-2 – duplikaatti-import |

### 🟡 Tietokantamalli

| Havainto | Selitys |
|----------|---------|
| Ultrasound-malli: `serie` vs `series_id` | `analyze_service.py` käyttää `serie`, Django-malli `series_id` |
| Ei toleranssitaulua | Julkaisussa kuvattu "configuration-driven QA" mutta koodissa ei toleransseja |
| Ei laite/instituutiorekisteriä | Laitetiedot tulevat vain DICOM-metadatasta, ei erillistä laiterekisteriä |
| Ei audit-lokia | Julkaisussa mainittu traceability puuttuu |
| Raw SQL taulujen luontiin | `analyze_service.py` r. 49-65 – ei Django-migraatioita |
| `tranducertype` kirjoitusvirhe | `models.py` r. 25 – pitäisi olla `transducer_type` |
| Ultrasound-mallin sarakkeet inconsistent naming | `contentdate` vs `content_date` (XrayAnalysis) |

### 🟢 Hyvin toteutetut osat

| Osa | Kommentti |
|-----|----------|
| gRPC-arkkitehtuuri | Fetch ↔ Analyze -palvelujen erottelu toimiva |
| US-analyysialgoritmi | `US_IQ_analysis3.py` (37K) vaikuttaa kattavalta van Horssen -toteutukselta |
| X-ray NORMI-13 malli | Tietokantamalli kattaa Cu-kiilat, matalan kontrastin, MTF:n, geometrian |
| Monitoring stack | Prometheus + Grafana + Loki + Promtail – hyvä pohja |
| Röntgen-dashboard | `xray_deviceDetails_pro.html` on selkeästi edistynein template |
| Dockerfilet olemassa | Fetch, Analyze, AI – perustoteutukset olemassa |
| Minikube-manifestit | Pohja K8s-deploymentille jo olemassa |

---

## PÄIVITETTY SUUNNITELMA: 7 vaihetta

### Vaihe 0 – Siivoaminen ja peruskunto
**Agentti: `cleanup`** | Aika-arvio: 1 päivä

```
Tehtävät:
├── Poista kommentoitu koodi (views.py ~250 riviä)
├── Poista duplikaatti-templateit (säilytä vain *_pro.html + luo uudet)
├── Poista VirtualEnvVersion/ -duplikaatti
├── Poista staticfiles/ versionhallinnasta
├── Poista __pycache__/ versionhallinnasta
├── Päivitä .gitignore (venv/, __pycache__/, staticfiles/, *.pyc, .env)
├── Korjaa requirements.txt UTF-8:ksi
├── Korvaa print() → logging kaikkialla
├── Poista duplikaatti-importit (urls.py)
└── Korjaa kirjoitusvirhe: tranducertype → transducer_type (+ migraatio)
```

**Claude Code -prompt:**
```bash
claude "Siivoa projekti: 1) Poista kaikki kommentoitu koodi views.py:stä. 
2) Korvaa kaikki print()-kutsut logger-kutsuilla. 3) Poista duplikaatti-importit. 
4) Päivitä .gitignore lisäämällä __pycache__, staticfiles, venv, .env, *.pyc. 
5) Korjaa requirements.txt UTF-8:ksi normaalilla muotoilulla."
```

---

### Vaihe 1 – Tietoturvan korjaus
**Agentti: `security`** | Aika-arvio: 0.5 päivää

```
Tehtävät:
├── Siirrä KAIKKI salaisuudet ympäristömuuttujiin:
│   ├── SLACK_WEBHOOK_URL
│   ├── ORTHANC_URL, ORTHANC_USERNAME, ORTHANC_PASSWORD
│   ├── DATABASE_* (jo osittain tehty analyze_service.py:ssä)
│   └── OPENAI_API_KEY (jo .env:ssä)
├── Luo .env.example mallitiedosto
├── Poista @csrf_exempt ja implementoi CSRF-tokenit JS-kutsuissa
├── Lisää Django LoginRequiredMixin / @login_required vieweihin
├── K8s: salasanat → Kubernetes Secrets (ei env-arvoja manifesteissa)
└── Lisää ALLOWED_HOSTS ja SECURE_*-asetukset settings.py:hyn
```

**Claude Code -prompt:**
```bash
claude "Korjaa tietoturva: 1) Siirrä views.py:n SLACK_WEBHOOK, orthanc_url, 
orthanc_username, orthanc_password ympäristömuuttujiin os.getenv()-kutsuilla. 
2) Luo .env.example. 3) Poista @csrf_exempt dekoraattorit ja lisää 
CSRF-token-käsittely JavaScript-kutsuihin. 4) Lisää @login_required kaikkiin 
vieweihin paitsi index. 5) Päivitä K8s-manifestit käyttämään Kubernetes Secrets."
```

---

### Vaihe 2 – Backend-refaktorointi
**Agentti: `backend`** | Aika-arvio: 2-3 päivää

```
Tehtävät:
├── Projektin uudelleennimeäminen:
│   ├── ultraSound/ → autoqad/ (Django project)
│   ├── first_app/ → qa_core/ (Django app)
│   ├── Päivitä: ROOT_URLCONF, WSGI_APPLICATION, INSTALLED_APPS
│   ├── Päivitä: kaikki importit (from first_app → from qa_core)
│   └── Päivitä: manage.py, urls.py, settings.py
│
├── Django settings split:
│   ├── settings/base.py (yhteiset)
│   ├── settings/dev.py (DEBUG=True, SQLite mahdollinen)
│   └── settings/prod.py (PostgreSQL, HTTPS, security)
│
├── Tietokantamallin laajennukset:
│   ├── Device-malli (laiterekisteri)
│   │   ├── station_name, serial_number, manufacturer, model
│   │   ├── institution (FK → Institution)
│   │   ├── department
│   │   ├── modality_type (US/XR/CT)
│   │   ├── commissioned_date
│   │   └── is_active
│   │
│   ├── Institution-malli
│   │   ├── name, region, address
│   │   └── contact_info
│   │
│   ├── ToleranceConfig-malli (julkaisun "configuration-driven QA")
│   │   ├── device (FK → Device)
│   │   ├── metric_name (esim. 's_depth', 'uniformity_center')
│   │   ├── reference_value (commissioning-arvo)
│   │   ├── warning_limit, action_limit
│   │   ├── valid_from, valid_to
│   │   └── created_by, notes
│   │
│   ├── AuditLog-malli
│   │   ├── user, action, model, field
│   │   ├── old_value, new_value, timestamp
│   │   └── ip_address
│   │
│   └── Yhtenäistä nimeämiskäytäntö:
│       ├── Ultrasound: contentdate → content_date jne.
│       └── Synkronoi analyze_service.py INSERT julkaisun tietokantamallin kanssa
│
├── API-refaktorointi:
│   ├── Django REST Framework viewsetit + serializers
│   ├── Yhtenäinen API-versiointi: /api/v1/
│   ├── Paginaatio suurille dataseteille
│   └── Yhdistä duplikaatti-endpointit
│
├── analyze_service.py:
│   ├── Poista raw SQL → käytä Django ORM:ää tai alembic-migraatioita
│   ├── Lisää horiz_prof, vert_prof INSERT:iin (puuttuu nyt!)
│   └── Lisää duplicate detection (ON CONFLICT DO NOTHING)
│
└── Testit:
    ├── models: luonti, validaatio, toleranssitarkistus
    ├── views: HTTP status, context data
    └── API: serialization, filtering
```

**Claude Code -prompt:**
```bash
claude "Refaktoroi backend: 1) Luo models.py:hyn Device, Institution, 
ToleranceConfig ja AuditLog -mallit. 2) Yhtenäistä Ultrasound-mallin 
kenttänimet snake_case-muotoon. 3) Lisää Django REST Framework: 
luo serializers.py ja viewsets API-endpointeille. 4) Jaa settings.py 
base/dev/prod-konfiguraatioihin. 5) Luo migraatiot."
```

---

### Vaihe 3 – Analyysimikropalvelujen kehitys
**Agentti: `analysis`** | Aika-arvio: 3-5 päivää

```
Tehtävät:
├── 3.1 Natiiviröntgenanalyysin integrointi (KOKONAAN UUSI PIPELINE):
│   ├── git clone https://github.com/MIPT-Oulu/radiography-qa
│   ├── Integroi normi13_qa/ -paketti gRPC-mikropalveluksi
│   ├── Luo xray.proto (XrayAnalyzeRequest/Response)
│   ├── Luo xray_analyzer.py (gRPC server, portti 50053)
│   ├── Luo xray_fetch -logiikka (Modality=="DX"/"CR" reititys fetch-palvelussa)
│   ├── Yhdistä analyysi → PostgreSQL (INSERT INTO xray_analysis)
│   ├── Testaa NORMI-13 phantom -segmentointi (analysis_script.py)
│   ├── Validoi Cu-kiila ROI:den paikoitus
│   └── Lisää Dockerfile.xray-analyzer
│
├── 3.2 CT-analyysimikropalvelu (uusi):
│   ├── Proto-määrittely: ct_analysis.proto
│   │   ├── CTAnalyzeRequest { instance_id, phantom_type }
│   │   └── CTAnalyzeResponse { metrics, status }
│   │
│   ├── Tuetut fantomit (konfiguroitava tietokannasta):
│   │   ├── Catphan 504/600:
│   │   │   ├── HU-tarkkuus (CTP404-moduuli)
│   │   │   ├── Uniformiteetti (CTP486)
│   │   │   ├── Kohinataso (CTP486)
│   │   │   ├── MTF / spatial resolution (CTP528)
│   │   │   ├── Matalan kontrastin detektointi (CTP515)
│   │   │   └── Geometrinen tarkkuus (CTP404)
│   │   ├── ACR CT Performance Phantom:
│   │   │   ├── CT number accuracy
│   │   │   ├── Slice thickness
│   │   │   ├── Low contrast
│   │   │   └── Spatial resolution
│   │   └── Siemens CT Phantom:
│   │       ├── HU-tarkkuus (vesi, ilma, luun ekvivalentti)
│   │       ├── Uniformiteetti
│   │       ├── Kohina
│   │       └── Geometrinen tarkkuus
│   │
│   ├── Toteutus:
│   │   ├── Käytä pylinac-kirjastoa (pip install pylinac)
│   │   ├── pylinac.ct: CatPhan504, CatPhan600 — valmiit analyysit
│   │   ├── ACR CT: pylinac.acr — valmiit analyysit
│   │   ├── Siemens CT phantom: custom wrapper pylinacin päälle tai oma toteutus
│   │   ├── Automaattinen fantomin tunnistus DICOM-metadatasta
│   │   └── JSON-tulosrakenne yhteensopiva Django-mallin kanssa
│   │
│   └── Django-malli: CTAnalysis
│       ├── DICOM-metadata (sama pohja kuin XrayAnalysis)
│       ├── phantom_type, phantom_module
│       ├── hu_water, hu_air, hu_bone, hu_acrylic
│       ├── uniformity_center, uniformity_edge_*, uniformity_integral
│       ├── noise_std, snr
│       ├── mtf_50, mtf_10
│       ├── low_contrast_visible
│       ├── geometric_accuracy_x, geometric_accuracy_y
│       └── slice_thickness_measured
│
├── 3.3 Abstrakti analyysipohjaluokka:
│   ├── BaseAnalyzer(ABC):
│   │   ├── validate_dicom(dataset) → bool
│   │   ├── extract_metadata(dataset) → dict
│   │   ├── analyze(dataset) → dict
│   │   ├── save_results(results, db_conn)
│   │   └── get_modality() → str
│   ├── UltrasoundAnalyzer(BaseAnalyzer)
│   ├── XrayAnalyzer(BaseAnalyzer)
│   └── CTAnalyzer(BaseAnalyzer)
│
└── 3.4 Proto-tiedostojen uudelleenjärjestely:
    ├── proto/
    │   ├── common.proto       # Shared messages
    │   ├── fetch.proto        # FetchService
    │   ├── ultrasound.proto   # USAnalyzeService
    │   ├── xray.proto         # XrayAnalyzeService
    │   └── ct.proto           # CTAnalyzeService
    └── Modaliteetin reititys fetch-palvelussa DICOM Modality-tagin perusteella
```

**Claude Code -prompt:**
```bash
claude "1) Debuggaa natiiviröntgenanalyysi: tarkista NORMI-13 phantom 
segmentointi ja Cu-kiila ROI-paikoitus. 2) Luo CT-analyysimikropalvelu: 
proto-tiedosto, Catphan-fantomin analyysi (HU-tarkkuus, uniformiteetti, 
kohina, MTF), Django-malli CTAnalysis. 3) Luo abstrakti BaseAnalyzer-
pohjaluokka josta US, XR ja CT perivät."
```

---

### Vaihe 4 – Frontend-uudistus (Dark Theme)
**Agentti: `frontend`** | Aika-arvio: 2-3 päivää

```
Suunnitteluperiaatteet:
├── Inspiraatio: OHIF Viewer + Grafana + Aidoc dashboard
├── Väripaletti:
│   ├── --bg-primary:    #0f1419  (syvä tumma)
│   ├── --bg-secondary:  #1a1f2e  (kortit, paneelit)
│   ├── --bg-tertiary:   #242938  (hover, aktiivinen)
│   ├── --text-primary:  #e6edf3
│   ├── --text-secondary:#8b949e
│   ├── --accent-blue:   #2f81f7  (linkit, aktiiviset)
│   ├── --status-ok:     #3fb950  (toleranssin sisällä)
│   ├── --status-warn:   #d29922  (varoitusraja)
│   └── --status-fail:   #f85149  (toimintaraja)
├── Typografia: "IBM Plex Sans" (headers) + "IBM Plex Mono" (data/koodit)
└── Layout: CSS Grid, sidebar-nav, responsive

Tehtävät:
├── 4.1 Luo base.html -pohjatyyli:
│   ├── Sidebar-navigaatio (modaliteetit, instituutiot)
│   ├── Top bar (käyttäjä, haut, notifikaatiot)
│   ├── Footer
│   ├── CSS custom properties (värit, fontit, spacing)
│   └── {% block content %} -lohko
│
├── 4.2 Dashboard / etusivu:
│   ├── Yhteenveto: laitteiden lukumäärä per modaliteetti
│   ├── Statuskartta: OK / Warning / Action per laite (värikoodattu)
│   ├── Viimeisimmät QA-tulokset (aikajana)
│   └── Hälytykset / poikkeamat
│
├── 4.3 Modaliteetti-sivut (US, XR, CT):
│   ├── Instituutiolista → Osastolista → Laitelista → Laite-dashboard
│   ├── Yhtenäinen navigaatiopuu (breadcrumbs)
│   └── Laite-dashboard (pohjana xray_deviceDetails_pro.html):
│       ├── DICOM-kuva-katselin (tumma tausta, parempi kontrasti)
│       ├── Aikasarjakuvaajat (Chart.js, tumma teema)
│       ├── Toleranssirajojen visualisointi kaavioissa
│       ├── AI-avustaja -paneeli
│       └── Slack-viestipaneeli
│
├── 4.4 Admin-paneeli (toleranssien hallinta):
│   ├── Laiterekisterin hallinta
│   ├── Toleranssirajojen asetus laitekohtaisesti
│   └── Audit-lokin tarkastelu
│
└── 4.5 Poista vanhat templateit:
    ├── Säilytä: xray_deviceDetails_pro.html (pohja uudelle)
    └── Poista: aloitus_sivu.html, ultraaeni_laadunvalvonta.html (1-4), 
               xray_deviceDetails.html (_improved, _modern, _new)
```

**Claude Code -prompt:**
```bash
claude "Uudista frontend: 1) Luo base.html dark theme -pohja käyttäen 
CSS custom properties -väripalettia (#0f1419 pohja, #2f81f7 aksentti). 
Käytä IBM Plex Sans -fonttia. 2) Luo sidebar-navigaatio modaliteeteille. 
3) Uudista etusivu dashboardiksi joka näyttää laitteiden statuksen. 
4) Päivitä kaikki templateit periytymään base.html:stä. 
5) Lisää toleranssirajojen visualisointi Chart.js-kaavioihin."
```

---

### Vaihe 5 – Kontainerointi
**Agentti: `devops`** | Aika-arvio: 1-2 päivää

```
Tehtävät:
├── 5.1 Dockerfilet (päivitä/luo):
│   ├── docker/Dockerfile.django
│   │   ├── python:3.12-slim
│   │   ├── gunicorn WSGI-palvelin
│   │   ├── collectstatic buildissa
│   │   └── health check: /api/health/
│   │
│   ├── docker/Dockerfile.orthanc
│   │   ├── jodogne/orthanc-plugins
│   │   └── orthanc.json mount
│   │
│   ├── docker/Dockerfile.fetch (päivitä olemassa olevaa)
│   ├── docker/Dockerfile.us-analyzer (päivitä)
│   ├── docker/Dockerfile.xray-analyzer (uusi)
│   ├── docker/Dockerfile.ct-analyzer (uusi)
│   └── docker/Dockerfile.ai-service (päivitä)
│
├── 5.2 docker-compose.yml (kehitysympäristö):
│   ├── Kaikki palvelut yhdellä komennolla
│   ├── Volumes: postgres-data, orthanc-data
│   ├── Networks: frontend-net, backend-net, monitoring-net
│   ├── Depends_on + healthcheck
│   └── .env-tiedosto konfiguraatioon
│
├── 5.3 docker-compose.prod.yml (tuotanto-overridet):
│   ├── Nginx reverse proxy (HTTPS termination)
│   ├── Resource limits
│   └── Restart policies
│
└── 5.4 Testaus:
    ├── docker-compose up -d → kaikki palvelut nousevat
    ├── Health check -endpointit vastaavat
    └── DICOM C-STORE → analyysi → web UI -ketju toimii
```

**Claude Code -prompt:**
```bash
claude "Luo Docker-konfiguraatio: 1) Dockerfile jokaiselle palvelulle 
(django+gunicorn, orthanc, fetch, us-analyzer, xray-analyzer, ct-analyzer). 
2) docker-compose.yml kaikilla palveluilla, PostgreSQL:llä ja verkkoeristyksellä. 
3) Health check endpointit. 4) .env-pohja ympäristömuuttujille."
```

---

### Vaihe 6 – Kubernetes-manifestit (cPouta)
**Agentti: `k8s`** | Aika-arvio: 2 päivää

```
Tehtävät:
├── 6.1 Laajenna Minikube-manifestit tuotantotasolle:
│   ├── k8s/namespace.yaml (autoqad namespace)
│   │
│   ├── k8s/secrets/
│   │   ├── db-credentials.yaml (base64-encoded)
│   │   ├── orthanc-credentials.yaml
│   │   ├── slack-webhook.yaml
│   │   └── openai-key.yaml
│   │
│   ├── k8s/configmaps/
│   │   ├── django-config.yaml (ALLOWED_HOSTS, DB-settings)
│   │   ├── orthanc-config.yaml (orthanc.json)
│   │   ├── prometheus-config.yaml
│   │   └── grafana-dashboards.yaml
│   │
│   ├── k8s/storage/
│   │   ├── postgres-pvc.yaml (20Gi, cinder-backed)
│   │   └── orthanc-pvc.yaml (50Gi)
│   │
│   ├── k8s/deployments/
│   │   ├── postgres.yaml (1 replica, PVC, resource limits)
│   │   ├── django.yaml (2 replicas, init-container: migrate+collectstatic)
│   │   ├── orthanc.yaml (1 replica, PVC, NodePort 4242)
│   │   ├── fetch-service.yaml (1 replica)
│   │   ├── us-analyzer.yaml (2 replicas → HPA)
│   │   ├── xray-analyzer.yaml (1 replica → HPA)
│   │   ├── ct-analyzer.yaml (1 replica → HPA)
│   │   ├── prometheus.yaml
│   │   └── grafana.yaml (NodePort 3000)
│   │
│   ├── k8s/services/
│   │   ├── django-service.yaml (NodePort → myöhemmin Ingress)
│   │   ├── postgres-service.yaml (ClusterIP)
│   │   ├── orthanc-service.yaml (NodePort 4242 DICOM + 8042 REST)
│   │   └── grpc-services.yaml (ClusterIP: fetch:50051, analyze:50052+)
│   │
│   ├── k8s/hpa/
│   │   └── analyzer-hpa.yaml (CPU 70% → scale 1-5 pods)
│   │
│   └── k8s/network-policies/
│       └── default-deny.yaml + allow-rules
│
├── 6.2 Deployment-skripti (deploy.sh):
│   ├── 1. kubectl apply namespace + secrets + configmaps
│   ├── 2. kubectl apply storage (PVCs)
│   ├── 3. kubectl apply postgres → wait --for=condition=ready
│   ├── 4. kubectl apply django, orthanc
│   ├── 5. kubectl apply fetch, analyzers
│   ├── 6. kubectl apply monitoring
│   └── 7. kubectl apply hpa, network-policies
│
└── 6.3 cPouta-spesifiset:
    ├── Noudattaa liitteen 2 K8s-asennusohjetta (containerd runtime)
    ├── Flannel CNI (testattu toimivaksi)
    ├── Cinder-backed PersistentVolumes
    └── Security groups: 6443 (API), 4242 (DICOM), 30000-32767 (NodePorts)
```

**Claude Code -prompt:**
```bash
claude "Luo Kubernetes-manifestit: 1) Namespace 'autoqad'. 2) Secrets 
kaikille salasanoille (base64). 3) Deployment+Service jokaiselle palvelulle 
resource limitseillä. 4) PVC:t PostgreSQL:lle ja Orthancille. 
5) HPA analyzereille (CPU 70%, min 1, max 5). 6) deploy.sh-skripti 
oikeassa järjestyksessä. Käytä julkaisun mukaista 1 CP + 2 worker arkkitehtuuria."
```

---

### Vaihe 7 – Integraatiotestaus
**Agentti: `testing`** | Aika-arvio: 1-2 päivää

```
Tehtävät:
├── Unit-testit:
│   ├── Django models (CRUD, validaatio, toleranssitarkistus)
│   ├── Django views (HTTP responses, context)
│   ├── US analyzer (tunnettu testidata → tunnetut tulokset)
│   ├── XR analyzer (NORMI-13 referenssidata)
│   └── CT analyzer (Catphan referenssidata)
│
├── Integration-testit:
│   ├── gRPC fetch → analyze -ketju
│   ├── Analyze → PostgreSQL tallennus
│   ├── Django API → tietokanta → JSON response
│   └── Slack webhook -integraatio (mock)
│
├── E2E-testit (docker-compose ympäristössä):
│   ├── DICOM C-STORE → Orthanc → fetch → analyze → DB → web UI
│   ├── Toleranssirajan ylitys → Slack-hälytys
│   └── AI-avustajan toiminta
│
└── K8s-testit (cPouta):
    ├── Pod failure → automaattinen uudelleenkäynnistys
    ├── Node failure → pod rescheduling
    ├── HPA: kuormitustesti → scale-up
    └── PVC: data säilyy pod-restartissa
```

---

## Tavoitehakemisto (päivitetty koodikatselmoinnin perusteella)

```
autoqad/
├── client/                          # Django web app
│   ├── autoqad/                     # Django project (nyt: ultraSound/)
│   │   ├── settings/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── qa_app/                      # Main app (nyt: first_app/)
│   │   ├── models.py               # + Device, Institution, Tolerance, AuditLog
│   │   ├── views.py                # Refaktoroitu, ei print():ejä
│   │   ├── serializers.py          # DRF serializers
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── urls.py
│   │   │   │   └── viewsets.py
│   │   ├── admin.py
│   │   ├── ai_chat.py
│   │   └── utils.py
│   ├── templates/
│   │   ├── base.html               # Dark theme pohja
│   │   ├── dashboard.html          # Uusi etusivu
│   │   ├── modalities.html
│   │   ├── us/                     # Ultraääni-templateit
│   │   ├── xr/                     # Röntgen-templateit
│   │   ├── ct/                     # CT-templateit
│   │   └── components/             # Uudelleenkäytettävät osat
│   ├── static/
│   │   ├── css/
│   │   │   └── theme.css           # Yksi yhtenäinen dark theme
│   │   ├── js/
│   │   └── images/
│   ├── tests/
│   └── manage.py
│
├── grpc_microservices/
│   ├── proto/
│   │   ├── common.proto
│   │   ├── fetch.proto
│   │   ├── ultrasound.proto
│   │   ├── xray.proto
│   │   └── ct.proto
│   ├── services/
│   │   ├── base_analyzer.py
│   │   ├── ultrasound/
│   │   │   ├── analyzer.py
│   │   │   ├── us_iq_analysis.py   # (nyt: US_IQ_analysis3.py)
│   │   │   └── Dockerfile
│   │   ├── xray/
│   │   │   ├── analyzer.py
│   │   │   ├── normi13_analysis.py
│   │   │   └── Dockerfile
│   │   └── ct/
│   │       ├── analyzer.py
│   │       ├── catphan_analysis.py
│   │       └── Dockerfile
│   ├── fetch_service/
│   │   ├── fetcher.py
│   │   └── Dockerfile
│   └── tests/
│
├── monitoring_stack/
│   ├── prometheus/
│   │   └── prometheus.yml
│   ├── grafana/
│   │   └── dashboards/
│   ├── loki/
│   │   └── loki-config.yaml
│   ├── promtail/
│   │   └── promtail-config.yaml
│   └── docker-compose.monitoring.yml
│
├── k8s/
│   ├── namespace.yaml
│   ├── secrets/
│   ├── configmaps/
│   ├── storage/
│   ├── deployments/
│   ├── services/
│   ├── hpa/
│   ├── network-policies/
│   └── deploy.sh
│
├── docker/
│   ├── Dockerfile.django
│   ├── Dockerfile.orthanc
│   └── nginx/
│       ├── Dockerfile.nginx
│       └── nginx.conf
│
├── tests/
│   ├── e2e/
│   └── integration/
│
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   └── k8s-cpouta-setup.md
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── pyproject.toml
├── .env.example
├── .gitignore
└── README.md
```

---

## Suoritusjärjestys

```
Vaihe 0: Siivoaminen (1 pv) ─────┐
                                   │
Vaihe 1: Tietoturva (0.5 pv) ─────┤
                                   │
          ┌────────────────────────┤
          │                        │
Vaihe 2: Backend (2-3 pv)    Vaihe 3: Analyysit (3-5 pv)
          │                        │
          └──────────┬─────────────┘
                     │
           Vaihe 4: Frontend (2-3 pv)
                     │
           Vaihe 5: Docker (1-2 pv)
                     │
           Vaihe 6: K8s (2 pv)
                     │
           Vaihe 7: Testaus (1-2 pv)

Kokonaisaika-arvio: ~2-3 viikkoa
```

**Kriittinen polku:** 0 → 1 → 2+3 (rinnakkain) → 4 → 5 → 6 → 7
