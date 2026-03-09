# AutoQAD — WSL2 + Docker kehitysympäristön käynnistys

## Edellytykset

- Windows 11 + WSL2 (Ubuntu)
- Docker Engine asennettu WSL2:een (EI Docker Desktop)
- Projekti kloonattu: `C:\Users\sylisiur\Projects\autoQAD\DICOM-Quality-Assurance`

---

## 1. WSL2-konfiguraatio (`C:\Users\<user>\.wslconfig`)

```ini
[wsl2]
networkingMode=nat
vmIdleTimeout=-1
```

### Miksi nämä asetukset?

| Asetus | Arvo | Syy |
|--------|------|-----|
| `networkingMode` | `nat` | **Mirrored-tila ei välitä Docker Engine -portteja Windowsiin luotettavasti.** NAT-tila toimii automaattisesti ilman portproxya. |
| `vmIdleTimeout` | `-1` | Estää WSL2:n automaattisen sammumisen, joka tappaa kaikki Docker-kontit. `-1` = ei koskaan sammu itsestään. |

### Kriittiset virheet joita välttää

1. **ÄLÄ käytä `networkingMode=mirrored`** — Docker Engine (natiivi Linux) portit eivät näy Windowsissa
2. **ÄLÄ käytä `netsh interface portproxy`** yhdessä mirrored-tilan kanssa — portproxy varaa portin ja estää Dockeria bindaamasta samaa porttia
3. **Jos vaihdat `.wslconfig`-tiedostoa**, aja aina `wsl --shutdown` ja käynnistä uudelleen

---

## 2. Käynnistys koneen uudelleenkäynnistyksen jälkeen

### Vaihe 1: Käynnistä Docker WSL2:ssa

```powershell
# PowerShell (ei tarvitse admin-oikeuksia)
wsl -d Ubuntu -e bash -c "sudo service docker start"
```

### Vaihe 2: Käynnistä kontit

```powershell
wsl -d Ubuntu -e bash -c "cd /mnt/c/Users/sylisiur/Projects/autoQAD/DICOM-Quality-Assurance && docker compose up -d"
```

### Vaihe 3: Tarkista tila

```powershell
wsl -d Ubuntu -e bash -c "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

Kaikkien konttien pitäisi näkyä `Up`-tilassa:

| Kontti | Portti (Windows) | Kuvaus |
|--------|-----------------|--------|
| autoqad-django | localhost:8001 | Django web-sovellus |
| autoqad-postgres | localhost:15432 | PostgreSQL-tietokanta |
| autoqad-orthanc | localhost:18042 | Orthanc DICOM REST API |
| autoqad-portainer | localhost:9000 | Portainer hallintapaneeli |
| autoqad-fetch | localhost:50051 | Fetch-mikropalvelu |
| autoqad-us-analyze | localhost:50052 | US-analyysipalvelu |
| autoqad-xr-analyze | localhost:50053 | XR-analyysipalvelu |
| autoqad-ct-analyze | localhost:50054 | CT-analyysipalvelu |

### Vaihe 4: Testaa selaimessa

- **Django:** http://localhost:8001
- **Admin-kirjautuminen:** http://localhost:8001/admin/ (admin / admin)
- **Portainer:** http://localhost:9000
- **Orthanc:** http://localhost:18042

---

## 3. Vianmääritys

### "Sivu ei lataudu" / "localhost ei vastaa"

```powershell
# 1. Tarkista onko WSL2 käynnissä
wsl -l -v
# → Ubuntu pitäisi olla Running-tilassa

# 2. Tarkista Docker
wsl -d Ubuntu -e bash -c "docker ps"
# → Jos "Cannot connect to Docker daemon": sudo service docker start

# 3. Tarkista toimiiko Django WSL2:n sisältä
wsl -d Ubuntu -e bash -c "curl -s -o /dev/null -w '%{http_code}' http://localhost:8001/"
# → 200 = Django toimii, ongelma on verkossa
# → 000/virhe = Django ei käynnissä, tarkista konttilogit

# 4. Tarkista konttilogit
wsl -d Ubuntu -e bash -c "docker logs autoqad-django --tail 20"
```

### Gunicorn WORKER TIMEOUT / OOM

Dockerfile käyttää 2 workeria ja 120s timeoutia. Jos edelleen kaatuu:
```bash
docker logs autoqad-django | grep -i "worker\|killed\|timeout"
```

### Tietokanta: puuttuvat sarakkeet

Mikropalvelut luovat taulut raakalla SQL:llä, mutta Django-mallit saattavat lisätä uusia sarakkeita. Jos näet `column X does not exist`:
```bash
docker exec autoqad-postgres psql -U postgres -d "QA-results" -c "\d ultrasound"
# Vertaa Django-malliin: client/qa_core/models.py
# Lisää puuttuva sarake:
docker exec autoqad-postgres psql -U postgres -d "QA-results" -c "ALTER TABLE ultrasound ADD COLUMN IF NOT EXISTS series_id TEXT DEFAULT '';"
```

### Tunnettuja tietokantakorjauksia (jo tehty)

```sql
-- u_low: PostgreSQL array → JSONB (Django JSONField)
ALTER TABLE ultrasound ALTER COLUMN u_low TYPE JSONB USING to_json(u_low);

-- Puuttuvat sarakkeet (fake-initial migraatio ei lisää näitä)
ALTER TABLE ultrasound ADD COLUMN IF NOT EXISTS series_id TEXT DEFAULT '';
ALTER TABLE ultrasound ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ultrasound ADD COLUMN IF NOT EXISTS horiz_prof JSONB;
ALTER TABLE ultrasound ADD COLUMN IF NOT EXISTS vert_prof JSONB;
```

---

## 4. Docker-imagen päivitys (koodimuutosten jälkeen)

```powershell
# Buildaa ja käynnistä vain Django-kontti uudelleen
wsl -d Ubuntu -e bash -c "cd /mnt/c/Users/sylisiur/Projects/autoQAD/DICOM-Quality-Assurance && docker compose build django-web && docker compose up -d django-web"
```

---

## 5. Automatisoitu käynnistys (wsl-ports.ps1)

Projektin juuressa on `wsl-ports.ps1` PowerShell-skripti joka automatisoi portproxy-asetukset. **Huom:** NAT-tilassa portproxy ei ole välttämätön, mutta skripti on hyödyllinen jos tarvitaan 0.0.0.0-bindaus (esim. muut laitteet samassa verkossa).

```powershell
# Aja admin PowerShellissa
.\wsl-ports.ps1
```
