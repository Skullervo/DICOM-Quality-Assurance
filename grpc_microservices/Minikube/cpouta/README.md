# cPouta k8s — korjattu asennus + testit (Physica Medica -revisio)

Tämä korvaa `physica-medica-revision-tests.md`:n Tehtävät 2–4 **nykyiselle
MSSQL-imagelle** sopivilla ohjeilla. Tehtävä 1 (klusterin asennus) doc:sta on ok.

## Mikä muuttui alkuperäiseen doc:iin nähden
| Alkuperäinen | Korjattu | Miksi |
|---|---|---|
| PostgreSQL | **MS SQL Server** | `skullervo/autoqad-us-analyze:latest` käyttää `pymssql` (todennettu imagesta) |
| Deploymenteissä ei env-muuttujia | **Env langitettu** (salasanat Secretistä, muut imagen oletuksista) | Ilman niitä podit eivät yhdistä kantaan/Orthanciin |
| Ei skeeman luontia | **`mssql-init` Job** ajaa `schema_mssql.sql`:n | Palvelut olettavat taulut olemassa |
| Orthanc `orthancteam` + env | **`jodogne/orthanc-python` + orthanc.json** | Sama kuin muualla projektissa; admin/alice, AET AUTOQAD |
| Local Orthanc DICOM `4242` | **`14242`** (podman-hostmappaus) | Nykyinen paikallinen setup mappaa 4242→14242 |

Palvelut on nimetty imagen env-**oletusten** mukaan (`autoqad-mssql`, `orthanc`,
`fetch-service`), joten podeille tarvitsee antaa vain salasanat.

---

## Tehtävä 2 — Deploy (control-planella)

```bash
kubectl create namespace autoqad

# Salasanat (VAIHDA vahva MSSQL-salasana; Orthanc = alice kuten orthanc.json:issa)
kubectl -n autoqad create secret generic autoqad-secrets \
  --from-literal=MSSQL_SA_PASSWORD='Vaihda_Vahva_Pw1!' \
  --from-literal=ORTHANC_PASSWORD='alice'

# Skeema ConfigMapiksi repon tiedostosta (kopioi schema_mssql.sql control-planelle ensin)
kubectl -n autoqad create configmap mssql-schema \
  --from-file=schema_mssql.sql=./schema_mssql.sql

kubectl apply -f autoqad-cpouta.yaml
```

### Varmista
```bash
kubectl get pods -n autoqad
kubectl wait --for=condition=Ready pods -l app=mssql -n autoqad --timeout=300s
kubectl get job mssql-init -n autoqad            # COMPLETIONS 1/1
kubectl wait --for=condition=Ready pods --all -n autoqad --timeout=300s
# Odotetut: mssql(1), orthanc(1), fetch(1), us-analysis(2) + mssql-init(Completed)
```
Jos `us-analysis` crash-loopaa: `kubectl logs -n autoqad -l app=us-analysis` — yleensä
puuttuva `DATABASE_PASSWORD`/`ORTHANC_PASSWORD` tai skeema-Job kesken.

---

## Tehtävä 3 — Kuvat paikallisesta Orthancista cPoutaan

cPoutan Orthanc NodePortina: DICOM `86.50.23.185:30042`, HTTP `86.50.23.185:30080`.

Lisää cPouta-modality **paikalliseen** Orthanciin ja lähetä (HUOM local-portit 18042/14242):
```bash
curl -u admin:alice -X PUT http://localhost:18042/modalities/cpouta \
  -d '{"AET":"AUTOQAD","Host":"86.50.23.185","Port":30042}'

# Lähetä kaikki (tai rajaa Modality=US)
for s in $(curl -su admin:alice http://localhost:18042/studies | jq -r '.[]'); do
  curl -su admin:alice -X POST http://localhost:18042/modalities/cpouta/store -d "$s"
done

# Varmista perillä
curl -su admin:alice http://86.50.23.185:30080/statistics | jq .CountInstances
```
> Paikallisessa Orthancissa on jo ~1640 US-instanssia — riittävästi kuormatestiin.

---

## Tehtävä 4 — Testit (korjattu metodologia)

Aja `./run-tests.sh` control-planella (vaatii `dcmtk`, `bc`, `jq`, `python3`).

- **TESTI 1–3 (pod recovery time):** toimivat kuten doc:ssa — poista pod, mittaa
  `kubectl wait ... Ready` -aika. 10 toistoa analyysipodille, 1 postgres→**mssql** ja
  Orthanc.
- **TESTI 4 (per-image processing):** us-analyze on **instrumentoitu** mittaamaan
  per-kuva analyysiaika (`processing_time`-sarake, sekunteina — kuten XR/CT:ssä).
  Testi tyhjentää `ultrasound`-taulun, triggeröi kierroksen
  (`kubectl rollout restart deploy/us-analysis`) ja lukee `processing_time`-arvot
  suoraan → mitattu keskiarvo/keskihajonta/min/max. (Ei enää arvio `processed_at`-erotuksista.)
- **TESTI 5 (skaalautuvuus):** ei 2 replikan "concurrent" (molemmat pollaavat samat
  sarjat → dedup-kilpailu), vaan **horisontaalinen skaalaus**: mittaa kokonaisaika N
  kuvan käsittelyyn `replicas=1` vs `2` vs `4`. Speedup = t₁ / tₙ.
- **TESTI 6 (task survival):** tuo N kuvaa, tapa `us-analysis`-pod kesken, odota
  palautuminen, varmista että **kaikki N riviä** silti syntyy (dedup + re-poll palauttaa
  keskeytyneen). Onnistuminen = rivimäärä saavuttaa N.

> Per-kuva-mittaus on jo koodissa (`analyze_service_timed.py` → `processing_time`).
> Vaatii instrumentoidun imagen (`skullervo/autoqad-us-analyze:latest` rebuild+push).

---

## Cleanup
```bash
kubectl delete namespace autoqad     # poistaa kaiken
# tai koko klusteri: kubeadm reset (kaikilla nodeilla)
```
