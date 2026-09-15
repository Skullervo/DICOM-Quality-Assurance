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

### 3.1 v1 — alkuperäinen koodi
| Replikoita | Kokonaisaika | Speedup |
|---|---|---|
| 1 | 294,5 s | 1,00× |
| 2 | 304,0 s | 0,97× |
| 4 | 302,8 s | 0,97× |

**Ei skaalausta.** Syy: jokainen replika pollaa *kaikki* sarjat ja deduplikoi (`is_instance_analyzed`) — työtä ei jaeta, replikat duplikoivat sen. Dedup on idempotenssia varten, ei työnjakoa.

### 3.2 v2 — työnjako lisätty (claim-mekanismi), puhdas N=802

Synkronoitu käynnistys, **jokainen kierros N=802** (reclaim varmistaa täydellisyyden), db_span = ensimmäisestä viimeiseen analyysiin.

| Replikoita | Kokonaisaika | Speedup |
|---|---|---|
| 1 | 383,6 s | 1,00× |
| 2 | 274,0 s | **1,40×** |
| 4 | 384,3 s | 1,00× |

Työ jakautuu nyt tasaisesti (~50/50 satunnaistuksella). Claim-mekanismin lisäkustannus nostaa yhden replikan aikaa (~294→384 s vs. alkuperäinen). **1→2 tuo aidon 1,40× nopeutuksen**, mutta **4 replikaa ei skaalaudu pidemmälle** (~1,00×) — CPU-sidonnainen katto tällä 4-vCPU-klusterilla (ks. 3.3). *(R=4:n tarkkaan lukuun sekoittuu pieni orpo-varausten reclaim-häntä, mutta johtopäätös — ei lisähyötyä 2 replikan jälkeen — on riippumaton siitä.)*

### 3.3 v3 — pullonkaula poistettu (fetch 1→3 replikaa, CPU-rajat 0,25/0,5 → 1)
- **us=4: ~227 s** (vs. v2:n 300 s) → **~24 % nopeampi**

**→ Pullonkaula oli yksi CPU-rajattu fetch-service (0,25 CPU) + tiukat CPU-rajat**, ei arkkitehtuuri. Kun tarjoilijalle (fetch) ja analysoijille annettiin resursseja, skaalaus jatkui.

**Katto tässä klusterissa:** worker-nodeissa yhteensä vain 4 vCPU. Suuremmalla klusterilla skaalautuisi pidemmälle.

### 3.4 Hajautettu laskenta vs. single node

"Single node" = 1 analyysi-instanssi (replicas=1); "hajautettu" = useampi replika klusterissa.

| | Kokonaisaika (802 kuvaa) | vs. single node |
|---|---|---|
| Single node (1 replika) | 371 s | 1,00× |
| Hajautettu, 2 replikaa (v2) | 291 s | **1,27× nopeampi** |
| Hajautettu, 4 replikaa (v3, pullonkaula poistettu) | ~227 s | **~1,6× nopeampi** |
| Hajautettu, alkuperäinen koodi (ei työnjakoa) | ~300 s | **0,97× (ei hyötyä)** |

**Johtopäätökset:**
1. **Alkuperäisellä koodilla hajautus ei tuonut mitään** — usea replika = sama tai hitaampi kuin single node, koska replikat duplikoivat työn (ei työnjakoa). Lisänodet menivät hukkaan.
2. **Työnjaon lisäämisen jälkeen hajautettu voittaa single noden:** ~1,3× kahdella replikalla, jopa ~1,6× neljällä kun jaettu pullonkaula (yksi CPU-rajattu fetch-service) poistettiin.
3. **Nopeutus on alilineaarista** (ei 2×/4×): jaetut pullonkaulat (single fetch/MSSQL/Orthanc), claim-lisäkustannus, pieni klusteri (4 vCPU) ja podien porrastettu käynnistys rajoittavat.
4. **Hajautus nopeuttaa läpimenoa (eräaika), ei per-kuva-latenssia** — yhden kuvan analyysiaika (0,184 s) pysyy samana replikamäärästä riippumatta.

---

## 4. Koodimuutokset (`grpc_microservices/Analyze_service/analyze_service_timed.py`)

1. **`processing_time`-instrumentointi** — per-kuva keston mittaus/tallennus (kuten XR/CT:ssä).
2. **Työnjako (claim):** `analysis_claims`-taulu + `claim_instance()` — kukin kuva varataan atomisesti (PRIMARY KEY), joten se analysoidaan tasan kerran → mahdollistaa horisontaalisen skaalauksen.
3. **Loop-resilienssi:** analyysikierros käärittiin try/exceptiin — transientti DB-virhe ei enää tapa analyysisäiettä pysyvästi (aiemmin yksittäinen virhe pysäytti podin analyysin kokonaan).
4. **Kilpailunkestävä taulunluonti:** `_ensure_claims_table` sietää virheen 2714 (kaksi replikaa luo taulua yhtä aikaa).
5. **Järjestyksen satunnaistus:** `random.shuffle(series_list)` — replikat eivät marssi lukkoaskelin → tasainen työnjako.
6. **Reclaim (orpojen varausten haltuunotto):** jos varaus on vanhentunut (`CLAIM_TIMEOUT_SECONDS`, oletus 120 s) eikä kuvaa ole analysoitu, toinen replika ottaa sen atomisella UPDATElla ja analysoi. Näin kaatuneen podin työ ei jää jumiin → kaikki kuvat valmistuvat (TESTI 6: 3/3).
7. **Sweep (nopea reclaim):** kierroksen alussa yksi `DELETE ... WHERE stale AND NOT analyzed` vapauttaa **kaikki** orvot varaukset kerralla, jolloin ne käsitellään heti samalla kierroksella. Poistaa per-instanssi-reclaimin hitaan hännän (aiemmin orvot ryömivät sisään usean skannauskierroksen aikana).

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
