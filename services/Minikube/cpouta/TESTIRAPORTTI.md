# AutoQAD / Radiqa — Testiraportti: toteutus ja tulokset

**Physica Medica -revisio · cPouta Kubernetes -klusteri · 2026-09**

Tämä dokumentti kuvaa jokaisen suorituskyky- ja vikasietotestin **toteutuksen (miten se
tehtiin)** ja **tuloksen**. Aja-skriptit: [run-tests.sh](run-tests.sh); manifestit:
[autoqad-cpouta.yaml](autoqad-cpouta.yaml), [us-analysis-statefulset.yaml](us-analysis-statefulset.yaml).

---

## Ympäristö

| Node | Rooli | vCPU | RAM |
|---|---|---|---|
| autoqad-control | control-plane (+ MSSQL) | 3 | 4 GB |
| autoqad-worker-1 | worker | 2 | 2 GB |
| autoqad-worker-2 | worker | 2 | 2 GB |

- **Kubernetes** v1.29.15, containerd 2.3.5, Flannel-CNI, local-path-provisioner (PVC:t)
- **Komponentit:** MS SQL Server 2022 (control-planella, `max server memory` 1800 MB),
  Orthanc (jodogne/orthanc-python, PVC), fetch-service (Python gRPC, 3 replikaa),
  us-analysis (Python gRPC, StatefulSet index-sharding)
- **Testiaineisto:** 802 ultraäänikuvaa (1305:stä; 503 ei ratkea LUT-anturinimibugin takia).
  3 valmistajaa, 6 laitemallia, 30 anturia.

---

## Yhteenveto

| Testi | Mittari | Tulos |
|---|---|---|
| 1. Analyysipodin palautuminen | recovery-aika (10×) | **1,30 ± 1,77 s** |
| 2. MSSQL-podin palautuminen | recovery-aika | **62,1 s** (data säilyi) |
| 3. Orthanc-podin palautuminen | recovery-aika | **4,84 s** (data säilyi) |
| 4. Per-kuva analyysiaika | processing_time (N=802) | **0,184 ± 0,131 s** |
| 5. Horisontaalinen skaalaus | speedup 1→4 | **2,67×** (1,65× / 2,36× / 2,67× @ 2/3/4) |
| 6. Task survival | onnistuneet kierrokset | **3/3** |

---

## TESTI 1 — Analyysipodin palautumisaika

**Tavoite:** kuinka nopeasti Kubernetes korjaa kaatuneen analyysipodin (vikasietoisuus).

**Toteutus:**
1. Hae ajossa oleva us-analysis-pod.
2. Ota aikaleima, `kubectl delete pod <pod>` (simuloi kaatuminen).
3. `kubectl wait --for=condition=Ready pods -l app=us-analysis --timeout=120s` — odota kunnes k8s:n uudelleen luoma pod on Ready.
4. Erotus = palautumisaika. **10 toistoa**, lasketaan ka ± keskihajonta.

**Tulos:** **1,30 ± 1,77 s** (n=10, min 0,44 / max 5,62). Kevyt stateless-pod nousee sekunneissa; hajonta johtuu siitä että osa mittauksista on nopeita reschedule-aikoja ja osa todellisia uudelleenluonteja.

---

## TESTI 2 — MSSQL-podin palautumisaika

**Tavoite:** tilallisen (stateful) tietokantapodin palautuminen ja datan säilyminen.

**Toteutus:** tapa mssql-pod, mittaa `kubectl wait ... Ready` -aika (timeout 300 s). Varmista `max server memory` säilyi ja kanta vastaa.

**Tulos:** **62,1 s**, data säilyi (PVC). SQL Server 2022:n käynnistys + kannan recovery on raskas → kontrasti statelessiin (~1 s). Tekee näkyväksi tilallisen komponentin palautumiskustannuksen.

---

## TESTI 3 — Orthanc-podin palautumisaika

**Tavoite:** DICOM-varaston palautuminen + **datan säilyminen** (PVC).

**Toteutus:** tapa orthanc-pod, mittaa Ready-aika, varmista instanssimäärä REST-statistiikasta.

**Tulos:** **4,84 s**, **802 instanssia säilyi** (PVC). *Huom: alkujaan Orthanc käytti `emptyDir`:iä, jolloin podin tappo pyyhki kaikki DICOMit — korjattiin PVC:ksi.*

---

## TESTI 4 — Per-kuva analyysiaika

**Tavoite:** yhden kuvan analyysilaskennan kesto.

**Toteutus:** analyysipalveluun **instrumentoitiin `processing_time`-sarake** (`time.time()` ennen ja jälkeen `imageQualityUS.MAIN_US_analysis`-kutsun; sekunteina). Ajon jälkeen luetaan asettuneesta taulusta N=802.

**Tulos:** **0,184 ± 0,131 s** (N=802, min 0,024 / max 0,761; laskennan summa 147,9 s). Replikamäärästä riippumaton (per-kuva CPU-työ on sama).

---

## TESTI 5 — Horisontaalinen skaalaus

**Tavoite:** nopeutuuko 802 kuvan eräkäsittely kun analyysireplikoita lisätään.

**Toteutus (lopullinen, puhdas):**
- **Index-sharding** (StatefulSet): kukin pod käsittelee vain `hash(instance_id) % SHARD_TOTAL == SHARD_INDEX` -osansa. SHARD_INDEX = podin ordinaali (us-analysis-0/1/…), SHARD_TOTAL = replikamäärä (env). Ei claim-etsintäkulua, tasan jaettu.
- **Synkronoitu startti:** `podManagementPolicy: Parallel` + `kubectl delete pods` (kaikki kerralla) → podit startaavat yhtä aikaa.
- **Tyhjä taulu joka kierros** → koko 802 työtä. Mittari = db_span `DATEDIFF(MIN(processed_at), MAX(processed_at))` (ensimmäisestä viimeiseen analyysiin). Varmistus: uniikkeja = 802 (ei duplikaatteja).
- Toistetaan replikoilla **1 / 2 / 3 / 4** (SHARD_TOTAL = replikamäärä).

**Tulos:**

| Replikoita | Aika | Speedup | Rinnakkaistehokkuus |
|---|---|---|---|
| 1 | 301,8 s | 1,00× | — |
| 2 | 183,3 s | **1,65×** | 82 % |
| 3 | 128,0 s | **2,36×** | 79 % |
| 4 | 113,0 s | **2,67×** | 67 % |

**Aito horisontaalinen skaalaus** (2,67× neljällä). Tehokkuus laskee 82→67 % kun lähestytään worker-nodejen 4 vCPU:n rajaa + jaettuja palveluita.

### Skaalauksen tutkimuspolku (miten tulos varmistettiin)
1. **Alkuperäinen koodi:** 0,97× — jokainen replika pollasi kaikki kuvat ja duplikoi työn (ei työnjakoa).
2. **Sharding lisätty:** silti ~1,03×. **Yllättävää.**
3. **CPU-mittaus** (cgroup `usage_usec`, 15 s ikkunat): koko klusteri käytti vain **~0,7 CPU:ta** (7 vCPU:sta) → ei CPU-katto. CPU-**aikasarja** paljasti että podit ajoivat **vuoron perään, eivät rinnakkain** (pod-0: 45–150 s, pod-1: 165–270 s).
4. **Juurisyy:** `ultrasound.instance`-sarakkeella **ei ollut indeksiä** → `is_instance_analyzed` (SELECT WHERE instance=X per kuva) teki koko taulun skannauksen (O(n²)), ja skannauksen jaetut lukot **blokkasivat toisen podin INSERTit** → serialisointi.
5. **Korjaus:** `instance` NVARCHAR(MAX)→NVARCHAR(128) + `CREATE INDEX IX_ultrasound_instance` → seek, ei skannausta, ei lukkokilpailua → **podit ajavat rinnakkain** → yllä oleva 2,67×.

**Opetus:** skaalaus vaati SEKÄ (1) työnjaon (sharding) ETTÄ (2) jaetun tilan lukkokilpailun poiston (DB-indeksi). Kumpikaan yksin ei riittänyt.

---

## TESTI 6 — Task survival (kesken jääneen työn selviäminen)

**Tavoite:** selviääkö kaikki 802 kuvaa vaikka pod kaatuu **kesken analyysin** (dataa ei katoa).

**Toteutus:**
1. Tyhjennä taulu, triggeröi analyysikierros (802 työtä).
2. Anna edetä ~20 s, sitten **tapa us-analysis-pod kesken analyysin** (`kubectl delete pod`).
3. Odota kunnes rivimäärä saavuttaa **802** (reclaim-mekanismi ottaa kaatuneen podin orvot varaukset haltuun).
4. PASS jos kaikki 802 valmistui. **3 kierrosta** (tappo eri kohdissa: @62 / @94 / @118 kuvaa).

**Tulos:** **3/3 PASS** — kaikki 802 valmistui joka kierroksella. Kaatuneen podin orvot varaukset (`analysis_claims`) vanhenevat (`CLAIM_TIMEOUT_SECONDS`) ja toinen replika ottaa ne (reclaim + sweep).

---

## Arkkitehtuurin varmistus — gRPC

**Toteutus:** tarkistettiin fetch-servicen lokit + gRPC-porttien kuuntelu ajon aikana.

**Tulos:** us-analysis kutsuu **`FetchDicomData`-gRPC:tä** fetch-serviceltä jokaista kuvaa kohti (fetch-lokit: "🔍 Fetching… ✅ Successfully fetched" -virta; portit 50051/50052 auki). ~800 onnistunutta palvelujenvälistä gRPC-kutsua per analyysikierros → hajautettu gRPC-mikropalveluarkkitehtuuri toimii.

---

## Analyysitulokset laitteittain/antureittain (QA-metriikat)

**Toteutus:** analysoitujen kuvien QA-metriikat (`s_depth`, `u_cov`, `u_skew`) ryhmiteltynä valmistaja → malli → anturi (`tranducertype`-sarake sisältää LUT-osumista todellisen anturinimen). **N=802 — kaikki testiin syötetyt kuvat.**

**3 valmistajaa · 6 laitemallia · 30 anturia:**

| Valmistaja | Malli | Anturit (N) |
|---|---|---|
| **GE Healthcare** | LOGIQ E9 | LINEAR-15M(2), LINEAR-9M(1), SECTOR_PHASED(1), CURVED(1) |
| | LOGIQ S7 | C1-5(7), CURVED(6), LINEAR-9M(5), ML6-15(5), 9L(5), LINEAR-15M(4) |
| | LOGIQ S8 | CURVED-6M(10), LINEAR-15M(5), LINEAR-9M(4), LINEAR-8.5M(1), CURVED-4M(1) |
| **Philips** | iU22 | C5-1(1), L12-5(1), L17-5(1) |
| **Samsung** | RS80 EVO | L3-12A(21), LA2-9A(21), CA1-7A(19), CF4-9(19) |
| | RS85 | LA2-9A(185), L3-12A(132), LA4-18B(85), CA1-7A(79), LA2-14A(73), CA1-7S(60), LA3-16A(31), LA3-16AI(16) |

Kullekin ryhmälle keskiarvo S_depth / U_cov / U_skew — täydet luvut: [test-results-2026-09-14.md §7](test-results-2026-09-14.md). *PASS/WARN/FAIL odottaa hyväksyttävyysrajoja (tolerance).* Käsikirjoituksen laitteet (GE LOGIQ S7/S8/E9, Samsung RS85) kaikki mukana.

---

## Koodi- ja inframuutokset (mahdollistivat testit)

**analyysipalvelu** ([analyze_service_timed.py](../../Analyze_service/analyze_service_timed.py)):
1. `processing_time`-instrumentointi (TESTI 4)
2. Claim-työnjako (`analysis_claims`) + reclaim + sweep — vikasieto (TESTI 6)
3. Loop-resilienssi (kierrosvirhe ei tapa säiettä)
4. **Index-sharding** (SHARD_TOTAL/SHARD_INDEX) — puhdas skaalaus (TESTI 5)

**skeema** ([schema_mssql.sql](../../../scripts/schema_mssql.sql)): `processing_time`-sarake; **`IX_ultrasound_instance`-indeksi** (kriittinen skaalaukselle).

**infra:** Orthanc emptyDir→PVC (TESTI 3 datan säilyminen); MSSQL worker→control-plane + `max server memory` 1800 MB (vakautus 4-replikan kuormalla); us-analysis Deployment→StatefulSet (Parallel + anti-affinity, TESTI 5).

---

## Toistettavuus

- **Vikasieto + skaalaus (perus):** `./run-tests.sh` control-planella (vaatii kubectl, bc, jq, python3).
- **Sharding-skaalaus:** [us-analysis-statefulset.yaml](us-analysis-statefulset.yaml); skaalatessa aseta sekä `--replicas=R` että `SHARD_TOTAL=R`.
- **Deploy tyhjästä:** ks. [README.md](README.md).
