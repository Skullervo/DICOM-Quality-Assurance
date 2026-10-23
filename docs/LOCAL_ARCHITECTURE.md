# AutoQAD / Radiqa — lokaalin version tiedostokartta ja asennusopas

Dokumentti kuvaa **lokaalin version** (podman-konteilla pyörivä kehitys-/testiympäristö) koko sisällön: jokaisen tiedoston polun ja sen, mihin sitä käytetään palvelussa. Lopussa **asennusmuistilista sairaalaan**. Tarkoitettu ylläpitäjälle, joka haluaa ymmärtää ja korjata järjestelmää. Koodi on kommentoitu suomeksi tiedostotasolla — tämä on karttanäkymä kokonaisuuteen.

## 1. Mitä järjestelmä tekee

Radiqa on automaattinen lääketieteellisen kuvantamisen laadunvalvonta (QA):
sairaalan PACS lähettää QA-kuvat Orthanc-DICOM-palvelimelle → modaliteettikohtainen analyysi → tulokset MS SQL Serveriin → Go-backend tarjoilee REST-API:n + React-käyttöliittymän, jossa trendit, hyväksyttävyysrajat ja AI-avusteinen raportointi.

**Modaliteetit:** 
- Ultraääni (US) 
- Röntgen (XR = CR/DX, NORMI-13-fantomi) 
- CT (CatPhan-fantomi)
- Angiografia/läpivalaisu (XA, Leeds TOR-18 -fantomi — uusin)

```
Sairaalan PACS
   │ DICOM C-STORE
   ▼
Orthanc  (DICOM-varasto, :8042)
   │
   ├─ (A) LEGACY-MALLI: analyysipalvelut POLLAAVAT Orthancia, itsesuodattavat modaliteetin
   │       (us/xr/ct-analyze) ja analysoivat automaattisesti.
   │
   └─ (B) EVENT-DRIVEN-MALLI: Orthanc-webhook → ingestion-service → MS SQL Service Broker
           (herätys) → event-workerit varaavat jobit atomisesti ja analysoivat.
   ▼
Analyysi (pylinac/omat algoritmit)
   ▼
MS SQL Server  (:1433 — tulostaulut: ultrasound, xray_analysis, ct_analysis, angio_analysis)
   │                    (US/angio analyysikuvat → S3/SeaweedFS; XR/CT → DB BLOB)
   ▼
Go-backend  (:8080 kontissa, host-portti :8081)  — REST-API /Laadunhallinta/api/* + tarjoilee Reactin
   ▼
React SPA  (tuotannossa Go tarjoilee; kehityksessä Vite :5174)
   ▼
Selain
```

> **Tärkeää (päivitetty):** lokaali stäkki ajaa nyt **(B) EVENT-DRIVEN-mallia** — `start-podman.sh`
> käynnistää ingestionin, SeaweedFS:n (S3), Orthanc-webhookin ja event-workerit (us/xr/ct/angio),
> ja legacy-pollerit on poistettu. **Angio toimii vain event-driven-mallilla** (sille ei ole legacy-
> polleria). Validoitu päästä päähän: study → Orthanc-webhook → ingestion → worker → DB + S3-kuva.

## 2. Portit (lokaali)

| Palvelu                             | Kontin portti | Host-portti   |
|-------------------------------------|---------------|---------------|
| Orthanc (DICOM/REST)                | 4242 / 8042   | 14242 / 18042 |
| MS SQL Server                       | 1433          | 11433         |
| Fetch service (gRPC)                | 50051         | 50051         |
| US Analyze (gRPC)                   | 50052         | 50052         |
| XR Analyze (gRPC)                   | 50053         | 50053         |
| CT Analyze (gRPC)                   | 50054         | 50054         |
| Image service                       | 8090          | 8090          |
| Go-backend                          | 8080          | 8081          |
| React (Vite dev)                    | 5174          | 5174          |
| Worker-metriikat (Prometheus)       | 9110          | —             |
| SeaweedFS S3 (ei lokaalisti päällä) | 8333          | —             |

---

## 3. Tiedostokartta kerroksittain

### 3.1 Ingestion-palvelu — `ingestion-service/` (event-driven-mallin sisääntulo)
FastAPI-palvelu: ottaa Orthancin webhookin uudesta tutkimuksesta ja luo QA-jobit job-tauluihin.

| Tiedosto                    | Käyttö                                                                                                                                |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `app/main.py`               | FastAPI-sovellus + `/health`; käynnistyspiste.                                                                                        |
| `app/config.py`             | Asetukset ( env): DB/Orthanc + **modaliteettikartoitus** `MODALITY_US/XR/CT/ANGIO` (DICOM-koodi → kind).                              |
| `app/routes/webhook.py`     | `POST /webhook/study`: Orthancin StableStudy-heräte → enumeroi + luo jobit.                                                           |
| `app/services/orthanc.py`   | Orthanc REST: `enumerate_study` purkaa study→series→instances ja bucketoi us/xray/ct/angio (US+angio per instanssi, XR/CT per sarja). |
| `app/services/database.py`  | `JOB_TABLES` (kind→taulu) + `create_job` (idempotentti INSERT, laukaisee Service Broker -triggerin).                                  |
| `orthanc/autoqad_ingest.py` | Orthanc-plugin/Lua-vastine joka POSTaa webhookin ingestioniin.                                                                        |

### 3.2 Koordinaatio + tietokantaskeemat — `scripts/`
| Tiedosto | Käyttö |
|---|---|
| `scripts/schema_mssql.sql` | **Päätulostaulut** MS SQL:ään: ultrasound, xray_analysis, ct_analysis + sarakkeet. |
| `scripts/schema_eventdriven.sql` | Event-driven koordinaatio: Service Broker (jono+palvelu+contract per modaliteetti), **job-taulut** us/xray/ct/angio_jobs (tilakone QUEUED→…→COMPLETED/FAILED) + herätystriggerit. |
| `scripts/schema_angio.sql` | **angio_analysis**-tulostaulu (Leeds TOR-18 -metriikat; kuva S3-avaimena). |
| `scripts/generate_mssql_schema.py` | Generoi schema_mssql.sql:n (mallinnuksesta). |
| `scripts/migrate_pg_to_mssql.py` | Kertamigraatio PostgreSQL → MS SQL (vanha → nykyinen kanta). |
| `scripts/migrate_orthanc_images.py` | Orthanc-kuvien migraatio/apu. |
| `scripts/straighten_us_backfill.py` | US-näyttökuvien suoristus + tallennus Orthanciin SC-DICOMina (jälkitäyttö). |

> Ajojärjestys tuoreelle kannalle: `schema_mssql.sql` → `schema_eventdriven.sql` → `schema_angio.sql`.
> `tolerance_config`-taulun luo ja seedaa **Go-backend** käynnistyksessä (ks. 3.7).

### 3.3 Analyysipalvelut — `grpc_microservices/`
Jokaisessa palvelussa on (1) **legacy gRPC-palvelu** (pollaa Orthancia, Containerfilen oletus-CMD) ja
useimmissa (2) **event-driven worker** (`worker_*_eventdriven.py`, ajetaan k8s:ssä command-overridella).
`worker_common.py` ja `s3_client.py` ovat jaettuja (kopioitu jokaiseen palveluun itsenäisyyden vuoksi).

**Fetch — `Fetch_service/`** (DICOM-haku Orthancista, gRPC :50051)
| Tiedosto | Käyttö |
|---|---|
| `fetch_service.py` | gRPC-palvelin: hakee DICOM-dataa Orthancista muille palveluille. |
| `test_fetch_service.py` | Testit. |

**Image — `Image_service/`** (kuvien tarjoilu/leikkaus, :8090)
| Tiedosto | Käyttö |
|---|---|
| `image_service.py` | Tarjoilee DICOM-esikatselukuvia (Orthanc-proxy); Go-backend käyttää. |
| `us_crop.py` | US-kuvan rajaus/esikäsittely. |

**US — `Analyze_service/`** (ultraääni-QA, gRPC :50052)
| Tiedosto | Käyttö |
|---|---|
| `analyze_service.py` | Legacy gRPC-palvelu: pollaa Orthancia, suodattaa Modality=US, ajaa US-analyysin, kirjoittaa ultrasound-tauluun. |
| `analyze_service_timed.py` | Instrumentoitu variantti (ajoituksilla / skaalaustestit). |
| `US_IQ_analysis3.py` | **Varsinainen US-kuvanlaatualgoritmi** (in-air reverberation, van Horssen 2017): s_depth, u_cov, u_skew, u_low, profiilit. |
| `LUT_table_codes.py`, `LUT_taulukko_lisaa.py` | Anturi-LUT (probe-LUT) taulukot/koodit. |
| `worker_us_eventdriven.py` | **US event-worker**: Service Broker -herätys → claim → Orthanc-haku → analyysi → S3-kuva → ultrasound-taulu + QA-verdikti-metriikka. |
| `worker_common.py` | Jaettu `EventWorker`-runko (doorbell, atominen claim, reclaim, tilat, metriikat). |
| `s3_client.py` | S3/SeaweedFS-client (boto3) analyysikuvien tallennukseen. |
| `test_analyze_service.py` | Testit. |

**XR — `Xray_analyze_service/`** (röntgen NORMI-13 -QA, gRPC :50053)
| Tiedosto | Käyttö |
|---|---|
| `xray_analyze_service.py` | **Ydin + legacy gRPC**: `Normi13`-analysaattori (pylinac 3.38 monkey-patch), metadatan/tulosten poiminta, `insert_xray_analysis`, kuvarenderöinnit. Event-worker tuo nämä. |
| `xray_analyze_service_timed.py` | Instrumentoitu variantti. |
| `worker_xr_eventdriven.py` | **XR event-worker** (per sarja → per instanssi); kirjoittaa xray_analysis + kuvat DB BLOBeina. |
| `worker_common.py`, `s3_client.py` | Jaetut (ks. yllä). |

**CT — `CT_analyze_service/`** (CT CatPhan-QA, gRPC :50054)
| Tiedosto | Käyttö |
|---|---|
| `ct_analyze_service.py` | Legacy gRPC + CT-analyysin orkestrointi; kolmiportainen fallback. |
| `catphan_analyzer.py` | **CatPhan-analyysi** (pylinac): HU-lineaarisuus, uniformiteetti, MTF, matalakontrasti; mallin autodetektio (504/600), clear_borders/partial-scan-korjaukset. |
| `siemens_analyzer.py` | Fallback-analysaattori ei-CatPhan / Siemens-tapauksiin. |
| `worker_ct_eventdriven.py` | **CT event-worker**; kirjoittaa ct_analysis. |
| `worker_common.py`, `s3_client.py` | Jaetut. |

**Angio — `Angio_analyze_service/`** (läpivalaisu/angiografia XA, Leeds TOR-18) — UUSIN
| Tiedosto | Käyttö |
|---|---|
| `tor18_analysis.py` | **Ydin**: `AngioLeeds` (pylinac LeedsTOR sovitettuna Azurion XA:han: LUT pois, dpi ImagerPixelSpacingista, magnifioitu fantomi); metriikat (matalakontrasti + PIU luotettavia, MTF best-effort); metadatan poiminta. |
| `worker_angio_eventdriven.py` | **Angio event-worker** (per instanssi, Modality=XA); analyysi → S3-kuva → angio_analysis. |
| `worker_common.py`, `s3_client.py` | Jaetut. |
| `requirements.txt`, `Containerfile` | Riippuvuudet + kontti (CMD = worker). |

**AI — `AI/`** (OpenAI GPT -integraatio; nykyinen tuotanto on Go-backendissä, ks. ai.go)
| Tiedosto | Käyttö |
|---|---|
| `gpt_api.py`, `gpt_api2.py`, `gpt_chat.py` | FastAPI/chat-prototyypit GPT-kyselyille US-metriikoista. |
| `ai_test.py`, `testcase.py`, `test_apikey.py` | Testit/kokeilut. |

### 3.4 Objektivarasto — SeaweedFS (S3-yhteensopiva)
US- ja angio-analyysikuvat tallennetaan S3:een (`s3_client.upload_bytes`), avain tallennetaan tauluun
(`output_image_path = s3://bucket/key`). **Ei käynnissä lokaalisti** — konfiguroidaan `object-storage.yaml`
(k8s) + `S3_*`-env. XR/CT käyttävät DB BLOBeja.

### 3.5 Go-backend — `go-backend/` (REST-API + tarjoilee Reactin, :8081)
| Tiedosto | Käyttö |
|---|---|
| `main.go` | Käynnistys, Chi-reititin, KAIKKI reitit `/Laadunhallinta/api/*`, tarjoilee Reactin. |
| `config/database.go` | MS SQL -yhteys (env DATABASE_*). |
| `middleware/auth.go` | `RequireAuth` — **TÄLLÄ HETKELLÄ PLACEHOLDER (päästää kaiken läpi!)**. Ks. asennusmuistilista. |
| `handlers/health.go` | `/health`. |
| `handlers/ultrasound.go` | US-reittien käsittelijät (institutions/units/device/data). |
| `handlers/xray.go` | XR-käsittelijät (kyselee xray_analysis). |
| `handlers/ct.go` | CT-käsittelijät (ct_analysis). |
| `handlers/angio.go` | **Angio-käsittelijät** (angio_analysis; kuvat S3:sta). |
| `handlers/image.go` | DICOM-esikatselun + analyysikuvien tarjoilu (XR/CT DB BLOB). |
| `handlers/storage.go` | **S3-kuvien tarjoilu** (US/angio presigned/proxy). |
| `handlers/tolerances.go` | **Luo + seedaa `tolerance_config`** käynnistyksessä (oletusrajat per modaliteetti, ml. ANGIO); GET/PUT rajat. |
| `handlers/measurements.go` | Geneerinen "mittaukset"-näkymä (Orthanc-ristiinviittaus). |
| `handlers/device_update.go` | Laitteen metatietojen muokkaus (UpdateDevice). |
| `handlers/ai.go` | **GPT-4o-integraatio** (/ask-ai) + US-mittauskonteksti promptiin. |
| `handlers/admin.go`, `handlers/hallinta.go` | Hallinta-/platform-näkymien API. |
| `handlers/db.go`, `handlers/metrics.go`, `handlers/static.go` | DB-apu, Prometheus /metrics, staattisten (React-buildin) tarjoilu. |
| `models/*.go` | Go-structit tauluille: `ultrasound.go, xray_analysis.go, ct_analysis.go, angio_analysis.go, device.go`. |

### 3.6 Frontend — `frontend/src/` (React + Vite + TypeScript)
| Ryhmä / tiedosto | Käyttö |
|---|---|
| `main.tsx`, `App.tsx` | Käynnistys + **reititys** (kaikki sivut/polut, ml. angio). |
| `api/client.ts` | **API-kutsut Go-backendille** (us/xray/ct/angio-metodit + tyypit). |
| `auth/` (`AuthProvider.tsx`, `RequireAuth.tsx`, `authContext.ts`, `introSeen.ts`) | Kirjautumistila + reittisuojaus (frontend-puoli). |
| `components/Layout.tsx` | Sivurunko + navigaatio (modaliteettivalikko). |
| `components/Breadcrumb.tsx`, `DeviceShared.tsx` | Jaetut: murupolku, laitesivujen yhteiset apurit (värit, pvm-muotoilu, alaindeksit). |
| `components/qa/` | QA-näkymän osat: `MetricValues` (mitatut arvot statusväreillä), `TrendChart` (trendikäyrä), `PagedTrendPanel`, `DeviceInfo` (DICOM-info), `VerdictBar` (verdiktti), `MainArea` (välilehdet), `ImageViewer`/`PngViewer`/`RoiOverlay` (kuvat), `AiChat`/`ReportTab`/`ContextView`/`contextText` (AI + raportointi). |
| `lib/qa/config.ts` | **Metriikkakonfiguraatio per modaliteetti** (`US/XR/CT/ANGIO_METRICS` + rajat). |
| `lib/qa/types.ts` | Keskitetyt tyypit (`Modality`, Metric, Status). |
| `lib/qa/status.ts` | `deriveStatus/deriveVerdict` (pass/warn/fail-luokittelu rajoja vasten). |
| `lib/qa/adapt.ts` | `buildMetrics` (DB-rivi + config + historia → näytettävät metriikat). |
| `lib/qa/useTolerances.ts` | Hakee rajat DB:stä (yliajaa config.ts:n). |
| `lib/qa/*.test.ts` | Yksikkötestit (adapt, status). |
| `pages/` | Yksi komponentti per näkymä. Modaliteettikohtaiset: `US/Xray/CT/Angio` + `Institutions/Units/DeviceDetails`. Yleiset: `Home, Login, Intro, Tietoa, Modaliteetit, Laitteet(+Modaliteetti), Mittaukset(+Modaliteetti), Rajat`. Platform/hallinta: `PlatformDashboard, ServiceList, StackList, Projects`. US-erityiset: `USOverview, USSummary, USTable, USUnitDetails`. |

### 3.7 Deploy / konfiguraatio
| Tiedosto | Käyttö |
|---|---|
| `grpc_microservices/*/Containerfile` | Kunkin palvelun konttikuva (Fetch/Image/US/XR/CT/Angio/AI). |
| `go-backend/Containerfile`, `frontend/Containerfile` | Go-backendin ja frontendin kontit. |
| `start-podman.sh` | **Lokaalin stäkin käynnistys** (bash podman-koneen sisällä): verkko, MS SQL + skeema, Orthanc, palvelut, go-backend-build+run. |
| `start-autoqad.ps1` | Windows-käynnistin joka ajaa start-podman.sh:n WSL:ssä. |
| `compact-podman-disk.ps1` | Ylläpito: compactaa podman-vhdx:n (vapauttaa C:-levyä; vaatii adminin). |
| `docker-compose.yml` | Vanha compose (gRPC-palvelut); osin korvautunut. |
| `grpc_microservices/Minikube/` | **Kubernetes-manifestit** (cPouta-tuotanto): go-backend, event-driven (ingestion + workerit, ml. **angio-worker**), object-storage (SeaweedFS), monitoring, analyze-deploymentit. |
| `monitoring_stack/` | Prometheus + Grafana + Loki (ei pakollinen lokaalisti). |

---

## 4. Lokaalin version käynnistys

```powershell
# Koko stäkki (podman-konteilla):
cd C:\Users\sylisiur\Projects\autoQAD\DICOM-Quality-Assurance
.\start-autoqad.ps1            # tai käynnistä kontit käsin: podman start <nimet> riippuvuusjärjestyksessä

# Frontend-kehityspalvelin (erikseen):
cd frontend ; npm run dev      # → http://localhost:5174
```
- Go-backend tarjoilee API:n host-portissa **8081**; Vite proxyttaa `/Laadunhallinta/api` → 8081.
- MS SQL host-portti **11433**, Orthanc **18042**.
- **Huom:** jos ajat go-backendin hostilta (ei kontissa), DB-host on `127.0.0.1:11433` ja Orthanc `localhost:18042`.

---

## 5. Kaksi arkkitehtuurimallia — valitse tuotantoon

| | (A) Legacy-pollerit | (B) Event-driven |
|---|---|---|
| Toiminta | Palvelut pollaavat Orthancia säännöllisesti | Orthanc-webhook → ingestion → Service Broker → worker |
| Lokaali tila | **Käynnissä** (us/xr/ct-analyze) | Toteutettu, **ei käynnissä** lokaalisti |
| Skaalautuvuus | heikompi | kilpailevat kuluttajat, skaalaa replikoilla |
| Angio | **ei tue** (ei polleria) | **ainoa tapa ajaa angio** |
| Vaatii | — | ingestion-service + Orthanc-webhook + Service Broker -skeema |

**Suositus sairaalaan:** event-driven (B), jotta kaikki 4 modaliteettia (ml. angio) toimivat yhtenäisesti.

---

## 6. Asennusmuistilista sairaalaan (⚠️ = kriittinen ennen tuotantoa)

1. **⚠️ Autentikointi.** `go-backend/middleware/auth.go` `RequireAuth` on placeholder (päästää kaiken).
   Toteuta oikea auth (JWT/sessio/SSO) ennen kuin API altistetaan — nyt potilasdata on suojaamaton.
2. **⚠️ Salaisuudet.** Lokaali `.env` (DB/Orthanc/OpenAI/Slack) EI tuotantoon — käytä K8s Secrets / holvia.
   Älä committaa `.env`-tiedostoa.
3. **⚠️ Tietokanta.** Aja sairaalan MS SQL:ään: `schema_mssql.sql` → `schema_eventdriven.sql` →
   `schema_angio.sql`. Go-backend seedaa `tolerance_config`-rajat käynnistyksessä.
4. **Arkkitehtuurivalinta.** Päätä (A) vai (B). Angio vaatii (B): ingestion-service + Orthancin
   webhook (`autoqad_ingest.py`) + Service Broker. Käynnistä tarvittavat event-workerit.
5. **Objektivarasto.** Jos US/angio käytössä → pystytä SeaweedFS (`object-storage.yaml`) + `S3_*`-tunnukset,
   muuten niiden analyysikuvat eivät tallennu/näy.
6. **Kontti-imaget.** Rakenna + vie rekisteriin (ghcr/docker.io) tai buildaa sairaalan koneella.
   **Angio-worker** on uusi: rakenna `Angio_analyze_service/Containerfile` ja lisää deploymentiin
   (manifesti on jo `grpc_microservices/Minikube/cpouta/event-driven.yaml`).
7. **Frontend-tuotantobuild.** `npm run build` → Go tarjoilee staattiset tiedostot (ei Vite-dev-serveriä).
8. **Reititys/proxy.** Caddy/F5 ohjaa `/Laadunhallinta/*` → go-backend (ks. CLAUDE.md Caddy-esimerkki).
9. **Varmuuskopiot.** MS SQL + Orthanc-data varmuuskopiointistrategia.
10. **Monitorointi.** Halutessa Prometheus/Grafana/Loki (`monitoring_stack/`, `monitoring.yaml`).
11. **Fyysikon vahvistus.** Hyväksyttävyysrajat (`tolerance_config` / `config.ts`) ovat **alustavia**;
    angion MTF on **best-effort** (ei luotettava Azurion-geometrialla) — fyysikon tarkistettava.
12. **DICOM-reititys.** Varmista että sairaalan laitteet/PACS lähettävät QA-kuvat Orthanciin ja että
    modaliteettikoodit täsmäävät (US, CR/DX, CT, XA).

---

## 7. Mikä EI ole osa lokaalia tuotantoydintä
- `hallinta/` (vanha Django-hallinta — osin korvautunut), `projects/autoQAD_django/` (arkistoitu Django),
  `venv/`, `node_modules/`, `scratchpad/` (kokeilut), `*_pb2.py` (generoidut gRPC-stubit).
