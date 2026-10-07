# AutoQAD — Event-Driven Architecture

Toteuttaa käsikirjoituksen §2.2.1–2.2.5 tapahtumapohjaisen QA-pipelinen. Korvaa
aiemman pollaus/claim/sharding-mallin. Rakennettu haaraan
`feature/event-driven-architecture`; validoitu end-to-end lokaalia podman-pinoa
vastaan (25 COMPLETED, analyysikuvat S3:ssa, tulokset ultrasound-taulussa).

## Virta

```
Hospital PACS
   │  DICOM C-STORE
   ▼
Orthanc ───(Lua OnStableStudy)──▶ Ingestion Service (FastAPI, :8000)
                                     │  enumeroi study Orthancin REST:llä
                                     │  luo QUEUED-jobit (dedup UNIQUE(orthanc_id))
                                     ▼
                                 MS SQL Server
                                 us_jobs / xray_jobs / ct_jobs  (tilakone)
                                     │  AFTER INSERT -trigger
                                     ▼
                                 Service Broker queue (doorbell)
                                     │  herätys
                                     ▼
                     Analysis Worker(s)  (competing consumers)
                       1. WAITFOR RECEIVE (doorbell)
                       2. reclaim vanhentuneet varaukset
                       3. atominen claim taulusta (READPAST)
                       4. Orthanc REST: hae DICOM
                       5. analysoi (US_IQ_analysis3)
                       6. PNG ─▶ S3 (SeaweedFS, qa/<mod>/<StudyUID>/<id>.png)
                       7. tulokset ─▶ ultrasound + output_image_path
                       8. job COMPLETED | FAILED(+error_message)
                                     │
                                     ▼
                     Go backend lukee: /us/analysis-image/{instance}
                       (S3-proxy) tai /us/analysis-image-url (presigned)
```

## Suunnitteluperiaatteet

- **Service Broker = herätys, DB-taulu = totuus.** Doorbell vain herättää workerin;
  työ varataan atomisesti taulusta (`UPDATE ... WITH (READPAST, ROWLOCK, UPDLOCK)`).
  Kadonnut/kahdentunut viesti ei johda kadonneeseen/kahteen kertaan ajettuun jobiin.
- **Idempotenssi:** `UNIQUE(orthanc_id)` job-taulussa → ingestion ei luo duplikaatteja.
- **Vikasietoisuus:** vanhentuneet CLAIMED/RUNNING-varaukset (kuollut worker) palautetaan
  QUEUEDiin (`claimed_at < now - CLAIM_TIMEOUT`).
- **Competing consumers:** useampi worker-replika jakaa työn ilman erillistä shardausta;
  `READPAST` ohittaa lukitut rivit.
- **S3-geneerinen:** worker (boto3) ja Go-backend (aws-sdk-go-v2) toimivat mitä tahansa
  S3-endpointtia vastaan (SeaweedFS/MinIO/…). Path-style addressing.

## Komponentit

| § | Komponentti | Sijainti |
|---|---|---|
| 2.2.3 | DB-skeema + Service Broker | `scripts/schema_eventdriven.sql` |
| 2.2.2 | Ingestion-palvelu | `ingestion-service/` |
| 2.2.1 | Orthanc-webhook | `ingestion-service/orthanc/autoqad_ingest.lua` |
| 2.2.4 | US-worker | `grpc_microservices/Analyze_service/worker_us_eventdriven.py` |
| 2.2.5 | S3-client | `grpc_microservices/Analyze_service/s3_client.py` |
| 2.2.5 | Object storage (k8s) | `grpc_microservices/Minikube/cpouta/object-storage.yaml` |
| 2.2.6 | Go backend (S3 luku, Slack, AI) | `go-backend/handlers/storage.go`, `ai.go` |

## Käyttöönotto (lokaali podman)

```bash
# 1. DB-skeema (idempotentti) — Service Broker + job-taulut
sqlcmd -S <host> -d QA-results -i scripts/schema_eventdriven.sql

# 2. S3 (SeaweedFS) — autoqad-net
podman run -d --name object-storage --network autoqad-net -p 8333:8333 \
  -v /tmp/seaweedfs:/etc/seaweedfs:ro -v autoqad-s3-data:/data \
  docker.io/chrislusf/seaweedfs:latest \
  server -dir=/data -s3 -s3.config=/etc/seaweedfs/s3config.json -ip.bind=0.0.0.0
# s3config.json: identities[].credentials accessKey/secretKey + actions

# 3. Ingestion
podman build -t localhost/autoqad-ingestion:latest ingestion-service/
podman run -d --name ingestion-service --network autoqad-net -p 8070:8000 \
  -e ORTHANC_URL=... -e ORTHANC_USERNAME=... -e ORTHANC_PASSWORD=... \
  -e DATABASE_HOST=... -e DATABASE_PASSWORD=... localhost/autoqad-ingestion:latest

# 4. Worker (sama analyze-image, CMD override)
podman build -t localhost/autoqad-us-worker:latest grpc_microservices/Analyze_service/
podman run -d --name us-worker-ed --network autoqad-net \
  -e DATABASE_HOST=... -e DATABASE_PASSWORD=... \
  -e ORTHANC_URL=... -e ORTHANC_PASSWORD=... \
  -e S3_ENDPOINT=http://object-storage:8333 -e S3_ACCESS_KEY=... -e S3_SECRET_KEY=... -e S3_BUCKET=qa-outputs \
  localhost/autoqad-us-worker:latest python worker_us_eventdriven.py

# 5. Orthanc: mountaa autoqad_ingest.lua + lisää konfiguraatioon
#    "LuaScripts": ["/etc/orthanc/autoqad_ingest.lua"]   (vaatii Orthanc-restartin)
```

Manuaalinen laukaisu ilman webhookia (testaus):
```bash
curl -X POST http://localhost:8070/webhook/study -H 'Content-Type: application/json' \
  -d '{"resource_id":"<orthanc-study-id>"}'
```

## Cutover (poller → event-malli)

Strangler fig: uusi worker ajetaan vanhan pollerin RINNALLA. Vaihda vasta kun
event-malli on todennettu tuotantoympäristössä:

1. **Rinnakkaisajo** — molemmat käynnissä. Event-worker käsittelee vain jobeja
   (ingestionin luomia); poller pollaa Orthancia kuten ennen. Molemmat kirjoittavat
   ultrasound-tauluun — tämä on turvallista idempotenssin ja eri laukaisupolkujen
   vuoksi, mutta voi tuottaa duplikaattirivejä jos sama kuva käsitellään molemmilla.
   Pidä rinnakkaisajo lyhyenä tai ohjaa uudet studyt vain ingestioniin.
2. **Webhook päälle** — ota Orthanc-Lua käyttöön, jolloin uudet studyt menevät
   event-malliin automaattisesti.
3. **Sammuta poller** — kun event-malli toimii:
   ```bash
   podman stop autoqad-us-analyze        # lokaali
   kubectl -n autoqad scale statefulset/us-analysis --replicas=0   # cPouta
   ```
4. **Skaalaus** — lisää workereita (competing consumers, ei SHARD_TOTAL-säätöä):
   ```bash
   kubectl -n autoqad scale deployment/us-worker --replicas=N
   ```

## Tila (2026-10)

- **US/XR/CT-workerit: VALMIIT + e2e-validoitu lokaalisti.** Jaettu `worker_common.py`
  (EventWorker) + `worker_{us,xr,ct}_eventdriven.py`. US → S3; XR/CT → DB-BLOBit
  (nykyinen Go-backend-lukupolku ennallaan).
- **Go-backend S3-luku: live-testattu** (`/us/analysis-image/{instance}` → 200 image/png
  SeaweedFS:stä). Lisäksi Slack-modaliteettireititys + AI-mittauskontekstointi.
- **cPouta: event-infra deployattu** — event-skeema (Service Broker + job-taulut),
  secretit, object-storage (SeaweedFS) 1/1 Ready.

### Jäljellä
- cPouta `ingestion` + `us-worker`: `kubectl apply -f event-driven.yaml` kun image-push
  docker.io/skullervo:hon onnistuu (Docker Hub -push estetty — rate limit / tili / ghcr).
- XR/CT-analyysikuvat voisi migratoida DB-BLOBeista S3:een (US:n tapaan) yhtenäisyyden
  vuoksi — vaatii output_image_path-sarakkeet + Go-backendin lukupolun muutoksen.
- Orthanc-Lua-webhookin tuotantokäyttöönotto (lokaali validointi tehty).
