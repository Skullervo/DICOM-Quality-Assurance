# AutoQAD / Radiqa — cPouta k8s -testitulokset (Physica Medica -revisio)

**Päivä:** 2026-09-14 · **Klusteri:** CSC cPouta, 3 nodea

## Ympäristö

| Node | Rooli | vCPU | RAM |
|---|---|---|---|
| autoqad-control | control-plane (+ MSSQL) | 3 | 4 GB |
| autoqad-worker-1 | worker | 2 | 2 GB |
| autoqad-worker-2 | worker | 2 | 2 GB |

- Kubernetes v1.29.15, containerd 2.3.5, Flannel-CNI
- Komponentit: MS SQL Server 2022 (control-planella, `max server memory` 1800 MB), Orthanc (jodogne/orthanc-python, PVC), fetch-service (Python gRPC :50051), us-analysis (Python gRPC :50052)
- **gRPC vahvistettu toimivaksi:** us-analysis kutsuu `FetchDicomData`-gRPC:tä fetch-serviceltä jokaista kuvaa kohti (~800 onnistunutta kutsua/passi)

### Testiaineisto
- **802 ultraäänikuvaa**, joiden anturi ratkeaa (LUT-osuma tai DICOM-tagi). Lähtöjoukko 1305; 503 jätettiin pois (ks. Tunnetut rajoitteet: LUT-bugi).
- **6 laitemallia, 30 uniikkia (malli+anturi)-yhdistelmää**, 3 valmistajaa:
  - GE Healthcare: LOGIQ E9, LOGIQ S7, LOGIQ S8
  - Samsung Medison: RS85, RS80 EVO
  - Philips: iU22

---

## 1. Vikasietoisuus — komponenttien palautumisaika

Pod tapetaan (`kubectl delete pod`), mitataan aika kunnes k8s on luonut sen uudelleen `Ready`-tilaan.

| Komponentti | Palautuminen | Data säilyi | Huom |
|---|---|---|---|
| Analyysipod (stateless) | **1,30 ± 1,77 s** (n=10, min 0,44 / max 5,62) | — | kevyt, nousee sekunneissa |
| Orthanc (PVC) | **4,84 s** | ✅ 802 instanssia | — |
| MSSQL (PVC, stateful) | **62,1 s** | ✅ | raskas moottorin käynnistys + kannan recovery |

Kontrasti stateless (~1 s) vs. stateful (~60 s) tekee näkyväksi tilallisen komponentin palautumiskustannuksen.

### 1.1 Task survival — selviääkö kesken jäänyt työ kaatumisesta

Analyysipod tapetaan **kesken analyysin**; varmistetaan että **kaikki 802 kuvaa** silti valmistuu (dataa ei katoa). 3 kierrosta.

| Kierros | Tapettu (analysoitu) | Lopputulos |
|---|---|---|
| 1 | @ 62 kuvaa | **PASS 802/802** |
| 2 | @ 94 kuvaa | **PASS 802/802** |
| 3 | @ 118 kuvaa | **PASS 802/802** |

**Task survival: 3/3.** Kaatuneen podin orvot varaukset (claim) vanhenevat ja toinen replika ottaa ne haltuun (reclaim, ks. kohta 4) → kaikki kuvat analysoidaan lopulta. Ilman reclaimia orvot varaukset jäivät jumiin (havaittiin 18/802 juuttuvan aiemmin).

---

## 2. Per-kuva analyysiaika

Instrumentoitu `processing_time`-sarake (sekunteina) mittaa yhden kuvan analyysilaskennan.

**0,184 ± 0,131 s** (N=802, min 0,024, max 0,761; laskennan kokonaissumma 147,9 s)

Per-kuva-aika on käytännössä replikamäärästä riippumaton (kunkin kuvan CPU-työ on sama); replikamäärän hyöty näkyy kokonaisajassa (kohta 3).

---

## 3. Horisontaalinen skaalaus (802 kuvaa)

Kokonaisaika = DB:n `processed_at`-väli (ensimmäisestä viimeiseen kirjoitettuun riviin).

Skaalausta tutkittiin kolmessa vaiheessa. **Lopullinen puhdas mittaustapa:** StatefulSet
index-sharding + synkronoitu startti (Parallel-podit, delete-all → yhtä aikaa) + tyhjä
taulu joka kierros → jokainen replikamäärä käsittelee koko 802:n; db_span = ensimmäisestä
viimeiseen analyysiin; varmistettu ettei duplikaatteja (uniikkeja = 802 joka kierros).

### 3.1 Alkuperäinen koodi — ei skaalausta
| Replikoita | Aika | Speedup |
|---|---|---|
| 1 | 294,5 s | 1,00× |
| 2 | 304,0 s | 0,97× |
| 4 | 302,8 s | 0,97× |

Jokainen replika pollaa *kaikki* sarjat ja deduplikoi — **työtä ei jaeta, replikat
duplikoivat sen.** Lisänodet menivät hukkaan.

### 3.2 Työnjako (index-sharding) lisätty — silti tasainen (!)
Deployment → StatefulSet; kukin pod käsittelee `hash(instance_id) % R == pod-numero`
-osansa (ei claim-etsintäkulua, tasan jaettu). Silti:

| Replikoita | Aika | Speedup |
|---|---|---|
| 1 | 314,8 s | 1,00× |
| 2 | 304,9 s | 1,03× |
| 3 | 306,1 s | 1,03× |

**Yllättäen edelleen tasainen.** CPU-mittaus paljasti miksi: koko klusteri käytti
**vain ~0,7 CPU:ta** (7 vCPU:sta) analyysin aikana — ei CPU-sidonnaista. CPU-aikasarja
näytti että **podit ajoivat vuoron perään, eivät rinnakkain** (pod-0: 45–150 s, pod-1:
165–270 s). Jokin serialisoi ne.

### 3.3 Juurisyy: puuttuva DB-indeksi → lukkokilpailu

`is_instance_analyzed` tekee `SELECT ... WHERE instance = X` **joka kuvalle**, mutta
`ultrasound.instance`-sarakkeella **ei ollut indeksiä** → **koko taulun skannaus** (O(n²)),
ja skannauksen jaetut lukot **blokkasivat rinnakkaisten podien INSERTit** (READ COMMITTED)
→ podit serialisoituivat. **Korjaus:** `CREATE INDEX IX_ultrasound_instance ON ultrasound(instance)`
(sarake NVARCHAR(MAX) → NVARCHAR(128) indeksointia varten).

### 3.4 Indeksin jälkeen — puhdas skaalaus ✅
| Replikoita | Aika | Speedup | Rinnakkaistehokkuus |
|---|---|---|---|
| 1 | 301,8 s | 1,00× | — |
| 2 | 183,3 s | **1,65×** | 82 % |
| 3 | 128,0 s | **2,36×** | 79 % |
| 4 | 113,0 s | **2,67×** | 67 % |

Kaikki N=802, uniikkeja=802 (ei duplikaatteja). **Aito horisontaalinen skaalaus** —
2,67× neljällä replikalla. Tehokkuus laskee 82 % → 67 % kun lähestytään worker-nodejen
4 vCPU:n rajaa ja jaettuja palveluita (Orthanc/MSSQL/fetch) → odotettua alilineaarisuutta.

### 3.5 Yhteenveto — hajautettu vs. single node
| Vaihe | 1→4 skaalaus | Selitys |
|---|---|---|
| Alkuperäinen koodi | 0,97× | replikat duplikoivat työn |
| Sharding, ei indeksiä | ~1,0× | DB-lukkokilpailu serialisoi podit |
| **Sharding + indeksi** | **2,67×** | aito rinnakkaisuus |

**Opetus:** horisontaalinen skaalaus vaati (1) työnjaon (sharding), (2) jaetun tilan
lukkokilpailun poiston (indeksi). Kumpikin yksin ei riittänyt. Hajautus nopeuttaa
läpimenoa (eräaika), ei per-kuva-latenssia (0,184 s pysyy samana).

---

## 4. Koodimuutokset (`grpc_microservices/Analyze_service/analyze_service_timed.py`)

1. **`processing_time`-instrumentointi** — per-kuva keston mittaus/tallennus (kuten XR/CT:ssä).
2. **Työnjako (claim):** `analysis_claims`-taulu + `claim_instance()` — kukin kuva varataan atomisesti (PRIMARY KEY), joten se analysoidaan tasan kerran → mahdollistaa horisontaalisen skaalauksen.
3. **Loop-resilienssi:** analyysikierros käärittiin try/exceptiin — transientti DB-virhe ei enää tapa analyysisäiettä pysyvästi (aiemmin yksittäinen virhe pysäytti podin analyysin kokonaan).
4. **Kilpailunkestävä taulunluonti:** `_ensure_claims_table` sietää virheen 2714 (kaksi replikaa luo taulua yhtä aikaa).
5. **Järjestyksen satunnaistus:** `random.shuffle(series_list)` — replikat eivät marssi lukkoaskelin → tasainen työnjako.
6. **Reclaim (orpojen varausten haltuunotto):** jos varaus on vanhentunut (`CLAIM_TIMEOUT_SECONDS`, oletus 120 s) eikä kuvaa ole analysoitu, toinen replika ottaa sen atomisella UPDATElla ja analysoi. Näin kaatuneen podin työ ei jää jumiin → kaikki kuvat valmistuvat (TESTI 6: 3/3).
7. **Sweep (nopea reclaim):** kierroksen alussa yksi `DELETE ... WHERE stale AND NOT analyzed` vapauttaa **kaikki** orvot varaukset kerralla, jolloin ne käsitellään heti samalla kierroksella. Poistaa per-instanssi-reclaimin hitaan hännän (aiemmin orvot ryömivät sisään usean skannauskierroksen aikana).
8. **Index-sharding (staattinen työnjako):** `SHARD_TOTAL` (env) + `SHARD_INDEX` (StatefulSetin ordinaali hostnamesta). Kun `SHARD_TOTAL>1`, kukin pod käsittelee vain `hash(instance_id) % SHARD_TOTAL == SHARD_INDEX` -osansa — ei claim-etsintäkulua, deterministinen tasainen jako. `SHARD_TOTAL<=1` → claim/work-stealing (aiempi). Deploy: [us-analysis-statefulset.yaml](us-analysis-statefulset.yaml) (Parallel podManagementPolicy + anti-affinity).
9. **DB-indeksi `ultrasound.instance`** ([scripts/schema_mssql.sql](../../../scripts/schema_mssql.sql)): poistaa `is_instance_analyzed`-kyselyn taulunskannauksen + rinnakkaisten podien lukkokilpailun → **mahdollistaa aidon skaalauksen** (ks. 3.3–3.4). *Kriittinen: ilman tätä skaalaus jää ~1,0×.*

---

## 5. Testien aikana tehdyt infrakorjaukset

- **Orthanc emptyDir → PVC:** ilman tätä Orthanc-podin tappo (TESTI 3) pyyhki kaikki DICOMit; PVC:llä data säilyy.
- **MSSQL worker → control-plane + `max server memory` 1800 MB:** SQL Server 2022 näki nälkää 2 GB:n workerilla (virhe 701) etenkin 4 replikan kuormalla; siirto 4 GB:n nodeen + muistikatto vakautti.

---

## 6. Tunnetut rajoitteet / jatkokehitys

- **Orvot claimit — KORJATTU:** reclaim (kohta 4.6) + sweep (kohta 4.7) → kaikki kuvat valmistuvat kaatumisen jälkeen, orvot varaukset vapautetaan kerralla (TESTI 6: 3/3, sweep-versio).
- **LUT/anturinimi-bugi:** 503/1305 kliinistä Samsung-kuvaa epäonnistui, koska `AddToLUT` kaatuu (FileDataset + interaktiivinen `input`). `transducer_name` on vain metatietolabel eikä ohjaa analyysiä → minimikorjaus avaisi ne. Anturinimien lisäys (OCR/kertaleimaus) = erillinen "Taso 2".
- **Pieni testiklusteri:** 4 worker-vCPU rajaa skaalauksen kattoa.

---

## 7. Analyysitulokset laitteittain/antureittain (QA-metriikat)

> N = kuvien määrä, keskiarvot per (valmistaja → malli → anturi). N=784 (puhtaan passin
> 18 kuvaa jäi orpojen claimien taakse, ks. kohta 6). PASS/WARN/FAIL vaatii
> hyväksyttävyysrajat (tolerance) → täydennetään erikseen. S_depth/U_cov/U_skew = DB:n arvot.

| Valmistaja | Malli | Anturi | N | S_depth | U_cov (%) | U_skew |
|---|---|---|---|---|---|---|
| **GE Healthcare** | LOGIQ E9 | LINEAR (15 MHz) | 2 | 1,3 | 4,17 | −1,210 |
| | LOGIQ E9 | LINEAR (9 MHz) | 1 | 1,0 | 2,26 | −0,490 |
| | LOGIQ E9 | SECTOR/PHASED (4 MHz) | 1 | 1,6 | 16,33 | 0,486 |
| | LOGIQ E9 | CURVED LINEAR (6 MHz) | 1 | 2,1 | 3,41 | −0,313 |
| | LOGIQ S7 | C1-5 (5 MHz) | 7 | 1,7 | 6,18 | −5,611 |
| | LOGIQ S7 | CURVED LINEAR (6 MHz) | 6 | 2,5 | 4,17 | −1,083 |
| | LOGIQ S7 | LINEAR (9 MHz) | 5 | 0,8 | 2,51 | −0,064 |
| | LOGIQ S7 | ML6-15 (15 MHz) | 5 | 0,2 | 4,51 | −0,620 |
| | LOGIQ S7 | 9L (9 MHz) | 5 | 0,7 | 3,33 | −0,839 |
| | LOGIQ S7 | LINEAR (15 MHz) | 4 | 0,8 | 4,35 | −0,265 |
| | LOGIQ S8 | CURVED LINEAR (6 MHz) | 10 | 1,9 | 8,99 | 0,364 |
| | LOGIQ S8 | LINEAR (15 MHz) | 5 | 0,8 | 2,60 | −1,418 |
| | LOGIQ S8 | LINEAR (9 MHz) | 4 | 0,8 | 2,42 | −0,158 |
| | LOGIQ S8 | LINEAR (8,5 MHz) | 1 | 1,0 | 2,93 | −0,958 |
| | LOGIQ S8 | CURVED LINEAR (4 MHz) | 1 | 1,8 | 5,96 | 0,639 |
| **Philips** | iU22 | C5-1 | 1 | 2,8 | 1,89 | −0,216 |
| | iU22 | L12-5 | 1 | 0,7 | 3,25 | −2,685 |
| | iU22 | L17-5 | 1 | 1,0 | 5,39 | −12,252 |
| **Samsung Medison** | RS80 EVO | LA2-9A | 21 | 0,7 | 3,37 | 0,015 |
| | RS80 EVO | L3-12A | 20 | 0,9 | 5,38 | −0,692 |
| | RS80 EVO | CA1-7A | 19 | 2,8 | 5,50 | −0,072 |
| | RS80 EVO | CF4-9 | 19 | 0,8 | 7,05 | 1,125 |
| | RS85 | LA2-9A | 182 | 0,7 | 4,10 | 0,793 |
| | RS85 | L3-12A | 129 | 0,8 | 3,33 | −0,470 |
| | RS85 | LA4-18B | 83 | 0,7 | 2,68 | −0,251 |
| | RS85 | CA1-7A | 75 | 2,8 | 4,07 | 0,131 |
| | RS85 | LA2-14A | 71 | 1,0 | 4,19 | −0,470 |
| | RS85 | CA1-7S | 58 | 2,2 | 8,42 | −0,483 |
| | RS85 | LA3-16A | 30 | 0,5 | 4,25 | −0,774 |
| | RS85 | LA3-16AI | 16 | 0,3 | 4,38 | −0,016 |

**Yhteensä 784 kuvaa · 3 valmistajaa · 6 laitemallia · 30 anturia.** Käsikirjoituksen laitteet
(GE LOGIQ S7/S8/E9, Samsung RS85) kaikki edustettuina; lisäksi Samsung RS80 EVO ja Philips iU22.
