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

> N = kuvien määrä, keskiarvot per (valmistaja → malli → anturi). **N=802 — kaikki testiin
> syötetyt kuvat** (koko ratkeava aineisto). S_depth/U_cov/U_skew = DB:n arvot.
> **PASS/WARN/FAIL-rajat: ks. 7.1** (data-vetoiset ehdokkaat).

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
| **Samsung Medison** | RS80 EVO | L3-12A | 21 | 0,9 | 5,27 | −0,679 |
| | RS80 EVO | LA2-9A | 21 | 0,7 | 3,37 | 0,015 |
| | RS80 EVO | CA1-7A | 19 | 2,8 | 5,50 | −0,072 |
| | RS80 EVO | CF4-9 | 19 | 0,8 | 7,05 | 1,125 |
| | RS85 | LA2-9A | 185 | 0,7 | 4,09 | 0,776 |
| | RS85 | L3-12A | 132 | 0,8 | 3,33 | −0,466 |
| | RS85 | LA4-18B | 85 | 0,7 | 2,68 | −0,250 |
| | RS85 | CA1-7A | 79 | 2,8 | 4,01 | 0,143 |
| | RS85 | LA2-14A | 73 | 1,0 | 4,15 | −0,469 |
| | RS85 | CA1-7S | 60 | 2,2 | 8,68 | −0,467 |
| | RS85 | LA3-16A | 31 | 0,5 | 4,25 | −0,781 |
| | RS85 | LA3-16AI | 16 | 0,3 | 4,38 | −0,016 |

**Yhteensä 802 kuvaa · 3 valmistajaa · 6 laitemallia · 30 anturia.** Käsikirjoituksen laitteet
(GE LOGIQ S7/S8/E9, Samsung RS85) kaikki edustettuina; lisäksi Samsung RS80 EVO ja Philips iU22.

### 7.1 PASS/WARN/FAIL-rajat (data-vetoiset ehdokkaat)

**Menetelmä:** per (malli+anturi) laskettu **robusti tilastoraja** — mediaani + MAD
(`σ = 1,4826 × MAD`, outlier-kestävä; ei ka ± SD, koska vialliset laitteet vääristäisivät sen).
Rajat **suunnattuja fysikaalisesti:**
- **S_depth** (tunkeutuma): matala = huono → **alaraja**. WARN jos < mediaani−2σ, FAIL jos < mediaani−3σ.
- **U_cov** (epätasaisuus): korkea = huono → **yläraja**. WARN jos > mediaani+2σ, FAIL jos > mediaani+3σ.
- **U_skew** (vinous): kaksisuuntainen. WARN jos \|arvo−mediaani\| > 2σ, FAIL jos > 3σ.

| Malli | Anturi | N | S_depth WARN/FAIL (alaraja) | U_cov WARN/FAIL (yläraja) | U_skew WARN/FAIL (±) |
|---|---|---|---|---|---|
| LOGIQS7 | C1-5 5000 | 7 | <1.49 / <1.37 | >10.94 / >12.92 | -7.19±1.53 / ±2.29 |
| LOGIQS7 | CURVED LINEAR 6000 | 6 | <2.31 / <2.27 | >7.24 / >8.70 | -0.10±1.77 / ±2.66 |
| LOGIQS7 | 9L 9000 | 5 | <0.69 / <0.69 | >3.81 / >4.24 | -0.61±0.11 / ±0.16 |
| LOGIQS7 | ML6-15 15000 | 5 | <0.14 / <0.09 | >5.25 / >5.87 | -0.60±0.58 / ±0.87 |
| LOGIQS7 | LINEAR 9000 | 5 | <0.71 / <0.70 | >2.86 / >2.95 | -0.14±0.08 / ±0.12 |
| LOGIQS8 | CURVED LINEAR 6000 | 10 | <1.51 / <1.42 | >16.47 / >21.37 | +0.39±0.43 / ±0.64 |
| LOGIQS8 | LINEAR 15000 | 5 | <0.24 / <0.06 | >4.05 / >4.73 | -1.34±0.67 / ±1.01 |
| RS80 EVO | L3-12A | 21 | <0.58 / <0.47 | >3.55 / >3.83 | -0.45±0.74 / ±1.12 |
| RS80 EVO | LA2-9A | 21 | <0.66 / <0.66 | >3.57 / >3.71 | +0.07±0.11 / ±0.17 |
| RS80 EVO | CA1-7A | 19 | <2.70 / <2.66 | >10.25 / >12.90 | -0.05±0.14 / ±0.22 |
| RS80 EVO | CF4-9 | 19 | <0.82 / <0.82 | >9.07 / >10.09 | +1.17±0.36 / ±0.54 |
| RS85 | LA2-9A | 185 | <0.59 / <0.56 | >4.54 / >4.89 | -0.24±0.63 / ±0.94 |
| RS85 | L3-12A | 132 | <0.41 / <0.21 | >3.84 / >4.09 | -0.43±0.94 / ±1.41 |
| RS85 | LA4-18B | 85 | <0.67 / <0.64 | >3.27 / >3.52 | -0.20±0.37 / ±0.56 |
| RS85 | CA1-7A | 79 | <2.59 / <2.51 | >3.51 / >4.16 | +0.16±0.35 / ±0.53 |
| RS85 | LA2-14A | 73 | <0.82 / <0.67 | >5.77 / >6.72 | -0.38±1.12 / ±1.68 |
| RS85 | CA1-7S | 60 | <2.00 / <1.73 | >7.74 / >10.11 | -0.23±0.78 / ±1.17 |
| RS85 | LA3-16A | 31 | <0.48 / <0.47 | >4.61 / >4.77 | -1.00±0.14 / ±0.21 |
| RS85 | LA3-16AI | 16 | <0.23 / <0.23 | >4.46 / >4.51 | -0.08±0.08 / ±0.12 |

**Varaukset (tärkeitä):**
1. **Pieni N (⚠):** GE LOGIQ E9 (N=1–2), Philips iU22 (N=1), sekä muutama LOGIQ S7/S8-ryhmä (N=1–4) **jätettiin taulukosta pois** — niillä MAD ≈ 0 → WARN = FAIL = mediaani (degeneroitunut, ei käyttökelpoinen). Näille rajat pitää **poolata taajuus/tyyppi-tasolle** tai ottaa kirjallisuudesta/valmistajalta. Yllä vain ryhmät N≥5 (RS85-ryhmät N≥16 luotettavimpia).
2. **Terveysoletus:** rajat olettavat että nykyinen laitekanta on pääosin terve. Fyysikon on katsottava outlierit ennen käyttöönottoa.
3. **Ehdokkaita, ei lopullisia:** ristiintarkista **van Horssen et al. 2017** -menetelmän suositukset + kliininen merkitsevyys. Nämä syötetään `tolerance_config`-tauluun ja säädetään /rajat-sivulta.
4. **Pitkällä tähtäimellä:** siirry per-laite trendirajaan (poikkeama laitteen omasta perustasosta), kun pitkittäisdataa kertyy.

### 7.2 PASS/WARN/FAIL-tulokset per laite+malli+anturi

Sovellettu 7.1:n rajat jokaiseen kuvaan; kuvan tila = **ankarin metriikka** (FAIL jos jokin
metriikka FAIL, WARN jos jokin WARN, muuten PASS). Ryhmillä joilla robusti σ=0 (kaikki arvot
samat) metriikkaa ei luokitella (PASS).

| Valmistaja | Malli | Anturi | N | PASS | WARN | FAIL | S_depth | U_cov | U_skew |
|---|---|---|---|---|---|---|---|---|---|
| GE | LOGIQ E9 | LINEAR 15000 | 2 | 2 | 0 | 0 | 1,3 | 4,17 | −1,210 |
| GE | LOGIQ E9 | SECTOR PHASED 4000 | 1 | 1 | 0 | 0 | 1,6 | 16,33 | +0,485 |
| GE | LOGIQ E9 | CURVED LINEAR 6000 | 1 | 1 | 0 | 0 | 2,1 | 3,41 | −0,313 |
| GE | LOGIQ E9 | LINEAR 9000 | 1 | 1 | 0 | 0 | 1,0 | 2,26 | −0,490 |
| GE | LOGIQ S7 | C1-5 5000 | 7 | 5 | 0 | 2 | 1,7 | 6,18 | −5,611 |
| GE | LOGIQ S7 | CURVED LINEAR 6000 | 6 | 4 | 0 | 2 | 2,5 | 4,17 | −1,083 |
| GE | LOGIQ S7 | 9L 9000 | 5 | 3 | 0 | 2 | 0,7 | 3,33 | −0,839 |
| GE | LOGIQ S7 | ML6-15 15000 | 5 | 4 | 0 | 1 | 0,2 | 4,51 | −0,620 |
| GE | LOGIQ S7 | LINEAR 9000 | 5 | 3 | 0 | 2 | 0,8 | 2,51 | −0,064 |
| GE | LOGIQ S7 | LINEAR 15000 | 4 | 4 | 0 | 0 | 0,8 | 4,35 | −0,265 |
| GE | LOGIQ S8 | CURVED LINEAR 6000 | 10 | 7 | 3 | 0 | 1,9 | 8,99 | +0,364 |
| GE | LOGIQ S8 | LINEAR 15000 | 5 | 4 | 1 | 0 | 0,8 | 2,60 | −1,418 |
| GE | LOGIQ S8 | LINEAR 9000 | 4 | 3 | 0 | 1 | 0,8 | 2,42 | −0,158 |
| GE | LOGIQ S8 | CURVED LINEAR 4000 | 1 | 1 | 0 | 0 | 1,8 | 5,96 | +0,639 |
| GE | LOGIQ S8 | LINEAR 8500 | 1 | 1 | 0 | 0 | 1,0 | 2,93 | −0,958 |
| Philips | iU22 | L17-5 | 1 | 1 | 0 | 0 | 1,0 | 5,39 | −12,252 |
| Philips | iU22 | L12-5 | 1 | 1 | 0 | 0 | 0,7 | 3,25 | −2,684 |
| Philips | iU22 | C5-1 | 1 | 1 | 0 | 0 | 2,8 | 1,89 | −0,216 |
| Samsung | RS80 EVO | L3-12A | 21 | 15 | 2 | 4 | 0,9 | 5,27 | −0,679 |
| Samsung | RS80 EVO | LA2-9A | 21 | 14 | 4 | 3 | 0,7 | 3,37 | +0,015 |
| Samsung | RS80 EVO | CA1-7A | 19 | 15 | 2 | 2 | 2,8 | 5,50 | −0,072 |
| Samsung | RS80 EVO | CF4-9 | 19 | 19 | 0 | 0 | 0,8 | 7,05 | +1,125 |
| Samsung | RS85 | LA2-9A | 185 | 152 | 16 | 17 | 0,7 | 4,09 | +0,776 |
| Samsung | RS85 | L3-12A | 132 | 122 | 5 | 5 | 0,8 | 3,33 | −0,466 |
| Samsung | RS85 | LA4-18B | 85 | 74 | 11 | 0 | 0,7 | 2,68 | −0,250 |
| Samsung | RS85 | CA1-7A | 79 | 47 | 10 | 22 | 2,8 | 4,01 | +0,143 |
| Samsung | RS85 | LA2-14A | 73 | 61 | 5 | 7 | 1,0 | 4,15 | −0,469 |
| Samsung | RS85 | CA1-7S | 60 | 35 | 7 | 18 | 2,2 | 8,68 | −0,467 |
| Samsung | RS85 | LA3-16A | 31 | 17 | 0 | 14 | 0,5 | 4,25 | −0,781 |
| Samsung | RS85 | LA3-16AI | 16 | 10 | 1 | 5 | 0,3 | 4,38 | −0,016 |
| **Yhteensä** | | | **802** | **628** (78 %) | **67** (8 %) | **107** (13 %) | | | |

**Tulkinta (tärkeä):** 13 % FAIL on **korkea**, kun rajat on johdettu samasta datasta — normaalijakaumalla ±3σ tuottaisi ~0,3 % FAIL. Tämä paljastaa että **metriikkojen jakaumat eivät ole normaaleja** (raskaat hännät / mahdollinen bimodaalisuus): tiivis ydin antaa pienen MAD:in → kapea band → häntäarvot ylittävät sen. Näkyy erityisesti RS85 CA1-7A (28 % FAIL), LA3-16A (45 %), CA1-7S (30 %).

**Johtopäätös menetelmästä:** puhdas MAD-pohjainen ±3σ on **liian tiukka** tälle QA-datalle. Vaihtoehdot: (a) **persentiilipohjaiset rajat** (esim. FAIL = 5./95. persentiili) jotka mukautuvat jakauman muotoon, (b) leveämpi k, tai (c) osa FAILeista on **aitoja poikkeamia** (vialliset anturit/asetukset) → fyysikon katselmus. Tämä on juuri se validointipalaute jonka rajojen käyttöönotto vaatii.
