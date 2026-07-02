# AutoQAD — Etenemispolku

Modernisointi: Django → Go + React, PostgreSQL → MS SQL Server, Docker → Podman.
Tämä dokumentti on elävä yleiskatsaus tilasta ja seuraavista askelista.

> Päivitetty: 2026-06. Yksityiskohdat: `docs/MSSQL_MIGRATION.md`, `CLAUDE.md`.

---

## Kohdearkkitehtuuri

```
Hospital PACS → Orthanc → Fetch(50051) → US/XR/CT-analyysit (Python gRPC)
                                              ↓
                                          MS SQL Server
                                              ↓
                                    Go-backend (Chi) + React SPA  ← AutoQAD (QA)
                                    (Podman, MSSQL)

Erillinen: projects/platform/  ← yleiskäyttöinen hallinta-alusta (oma projekti)
```

---

## Tila

| # | Vaihe | Tila |
|---|---|---|
| 1 | **Go + React presentaatiokerros** (korvaa Django client/) | ✅ US/XR/CT-sivut toimivat |
| 2 | **MSSQL-migraatio: skeema** (`scripts/schema_mssql.sql`) | ✅ 12 taulua MSSQL:ssä |
| 3 | **MSSQL: data-ETL** (`scripts/migrate_pg_to_mssql.py`) | ✅ 91 riviä (jatkuvuus) |
| 4 | **MSSQL: Go-backend** (`pgx`→`go-mssqldb`) | ✅ kontti ajossa MSSQL:ää vasten |
| 5 | **MSSQL: Python-analyysipalvelut** (`psycopg2`→`pymssql`) | ✅ US/XR/CT kontit ajossa MSSQL:ää vasten |
| 6 | **Re-analyysi** Orthanc-datalle → tuore data MSSQL:ään | ✅ US 42 / XR 8 / CT 2; skandit korjattu |
| 7 | **Platform/hallinta eriytys** omaksi projektiksi (`projects/platform/`) | 🔵 backend-ranka valmis; **oma projekti** (jatketaan erikseen) |
| 8 | **Django poisto** (`client/` → `projects/autoQAD_django/`) | ✅ arkistoitu; image-service irrotettu (us_crop.py); compose-osiot poistettu |
| 9 | **Frontend-bugit** (CT-asettelu, skandit, /devices, XR) | ✅ kaikki korjattu |

---

## AutoQAD — seuraavat askeleet (tämä projekti)

1. **Python-analyysipalvelut → MSSQL** (#5): Fetch/US/XR/CT-palvelut `psycopg2`→`pymssql`/`pyodbc`,
   CREATE TABLE/INSERT T-SQL:ksi, ODBC-driver kontteihin. Palvelu kerrallaan + verifiointi.
2. **Re-analyysi** (#6): aja analyysit Orthanc-datalle → tuore täysi data MSSQL:ään.
3. **Django client/ poisto** (#8): kun Go+React varmistettu kattamaan QA-näkymät.
4. **Frontend-bugit** (#9):
   - `/devices` + `/institutions` → 500 (rekisteritaulut puuttuvat — luo tai poista käytöstä)
   - Skandit (ä/ö) — todennäköisesti korjaantui MSSQL `Finnish_Swedish_CI_AS` -collationilla; varmista
   - CT-laitesivun tarkistus (sama välilehti/asettelu-malli kuin XR jos tarpeen)

## Kuvaliitteet — raportointi & AI (jatkokehitys, backend)

Laitesivun **Raportoi ongelmasta**- ja **Kysy tekoälyltä** -välilehdillä on frontendissä
kuvavalitsin (analyysikuvat pikkukuvina, käyttäjä valitsee). Nyt valitut kuvat välitetään vain
**tekstiviittauksina** (URL/nimet), koska taustapalvelut eivät vielä ota binäärikuvia vastaan.
Todellinen kuvien lähetys vaatii backend-työtä:

1. **Slack — oikeat kuvatiedostot raporttiin.** Nykyinen `ReportSlackIssue`
   (`go-backend/handlers/ai.go`) käyttää **incoming webhookia**, joka ottaa vain tekstiä.
   Kuvatiedostojen lähetys vaatii Slack **bot-tokenin** (`SLACK_BOT_TOKEN`) + kohdekanavan +
   uuden endpointin, joka hakee kuvat DB:stä (`ct_analysis`-VARBINARY-sarakkeet / Orthanc) ja
   lataa ne `files.upload` (v2) -rajapinnalla. Webhook-URLiin ei voi liittää tiedostoja.
2. **AI — kuvien todellinen "näkeminen" (vision).** `AskAI` käyttää jo `gpt-4o`:ta (kuvakykyinen),
   mutta lähettää `content`:n pelkkänä merkkijonona ja sisäiset kuva-URLit eivät ole OpenAI:n
   tavoitettavissa. Vaatii: endpoint ottaa vastaan kuvat **base64-data-URLeina**, rakentaa
   vision-payloadin (`content`: `[{type:"text"}, {type:"image_url", image_url:{url:"data:image/png;base64,…"}}]`),
   ja frontend hakee valitut kuvat base64:ksi ennen lähetystä.

Frontend-valitsin on jo paikallaan molemmilla välilehdillä → backend-osuus voidaan lisätä
myöhemmin ilman UI-muutoksia.

---

## Erillinen projekti: Platform / Hallinta (`projects/platform/`)
Yleiskäyttöinen sovellusten hallinta-alusta — EI AutoQAD-spesifi → omana projektinaan.
- ✅ Backend-ranka (Go, Chi, portti 8095): `/api/services|stacks|projects` MSSQL:stä
- ⏳ Frontend-ranka (React/Vite), kirjoitustoiminnot (deploy/muokkaus), Django-hallinnan poisto

---

## Paikallinen kehitysympäristö (Podman)

| Palvelu | Kontti | Portti |
|---|---|---|
| MS SQL Server 2022 | autoqad-mssql | 11433 (host) / 1433 |
| PostgreSQL (vanha, varmuuskopio) | autoqad-postgres | 15432 |
| Orthanc | autoqad-orthanc | 18042 |
| Go-backend (MSSQL) | autoqad-go-backend | 8081 |
| Platform-backend | (tuleva) | 8095 |
| React (Vite, AutoQAD) | — | 5174 |

Käynnistys: Windows-`podman start ...` (huom: `start-autoqad.ps1`:n WSL-kutsu on rikki tässä
ympäristössä — käytä Windows-podmania). MSSQL sa-salasana dev: `***REDACTED***`.
