# AutoQAD — Puuttuvat tiedostot ja tiedot Claude Code -agenttitiimille

## ⚠️ KIIREELLINEN: Vaihda OpenAI API-avain HETI

`.env`-tiedostossa oleva OpenAI API-avain (`sk-proj-jXIl...`) näkyi tässä
chat-sessiossa. **Käy vaihtamassa se OpenAI-dashboardissa välittömästi:**
https://platform.openai.com/api-keys

---

## 1. Tiedostot jotka Claude Code tarvitsee mutta PUUTTUVAT zipistä

### 🔴 Kriittiset (ilman näitä ei voi edetä)

| Tiedosto | Miksi tarvitaan | Sijaintisi |
|----------|----------------|------------|
| **CLAUDE.md** | ✅ Luotu tässä sessiossa — kopioi projektin juureen | → `autoqad/CLAUDE.md` |
| **Röntgenanalyysikoodi** | ✅ LÖYTYNYT — erillinen repo: `https://github.com/MIPT-Oulu/radiography-qa` (`normi13_qa/` + `analysis_script.py`). Claude Code voi kloonata tämän ja integroida gRPC-mikropalveluksi. | Erillinen GitHub-repo |
| **.env.example** (projektin juureen) | Claude Code tarvitsee tietää kaikki ympäristömuuttujat | → `autoqad/.env.example` |
| **orthanc.json** | Orthanc-konfiguraatio: DICOM AET, portit, autentikointi, Lua-skriptit | Onko sinulla tämä? |

### 🟡 Tärkeät (tarvitaan vaiheen 3+ aikana)

| Tiedosto | Miksi tarvitaan |
|----------|----------------|
| **CT-fantomikuvia** (Catphan/ACR DICOM) | CT-analyzerin kehitys ja testaus |
| **US-testikuvia** (in-air reverberation DICOM) | Unit-testit US-analyzerille |
| **Röntgen-testikuvia** (NORMI-13 phantom DICOM) | Unit-testit XR-analyzerille |
| **probe-LUT.xls** (client-versiosta) | `client/first_app/` sisältää `transducers.xls` — onko sama kuin `Analyze_service/probe-LUT.xls`? |

### 🟢 Olisi hyödyllisiä

| Tiedosto | Miksi tarvitaan |
|----------|----------------|
| **Referenssitulokset** (commissioning-data) | Toleranssirajojen asettaminen |
| **Orthanc Lua-skriptit** (jos käytössä) | Automaattinen reitityskonfiguraatio |
| **Grafana-dashboardien JSON-exportit** | Dashboardien uudelleenluonti K8s-ympäristössä |

---

## 2. Tiedot joita Claude Code ei tiedä

### Vastaa näihin ennen kehityksen aloitusta:

**Röntgenanalyysi:**
1. ✅ VASTAUS: Koodi on `https://github.com/MIPT-Oulu/radiography-qa` — integroidaan gRPC-palveluksi
2. ✅ VASTAUS: Koodia EI ole vielä ladattu eikä integroitu — ei fetch- eikä analysis-mikropalvelua. Django-mallit/viewit/templateit ovat valmiit, mutta analyysipipeline puuttuu kokonaan.
3. ✅ VASTAUS: Ei ole gRPC-mikropalvelua — pitää luoda kokonaan uusi (fetch + analyze)

**CT-analyysi:**
4. ✅ VASTAUS: Käytetään pylinacia. Tuetut fantomit: Catphan 504, Catphan 600, ACR CT phantom, Siemens CT phantom.
5. Onko sinulla Catphan/Siemens-DICOM-kuvia valmiina testaukseen?

**Arkkitehtuuri:**
6. ✅ VASTAUS: Nimetään uudelleen → `autoqad` (ultraSound → autoqad, first_app → qa_core/qa_app)

**cPouta/K8s:**
7. Käytätkö Cinder-backed vai NFS-pohjaista persistenttia tallennusta cPoutassa?
8. Mitä CNI-pluginia käytät — Flannel, Calico vai jokin muu?
9. Onko container registry käytössä (Docker Hub, Harbor, CSC:n oma)?

**Frontend:**
10. Kenelle UI on ensisijaisesti suunnattu — fyysikot, röntgenhoitajat, IT-ylläpitäjät?
11. Tarvitaanko monikielisyystuki (suomi + englanti) vai riittääkö suomi?

---

## 3. CLAUDE.md:n sijoitus ja käyttö

```bash
# Kopioi CLAUDE.md projektin juureen
cp CLAUDE.md autoqad/CLAUDE.md

# Claude Code lukee tämän automaattisesti jokaisen session alussa.
# Se kertoo Claude Codelle:
# - Projektin rakenteen ja arkkitehtuurin
# - Teknologiat ja versiot
# - Käynnistyskomennot
# - Tunnetut ongelmat
# - Koodauskonventiot
# - Ympäristömuuttujat
```

### Lisäksi voit luoda alikansioiden CLAUDE.md-tiedostoja:

```
autoqad/
├── CLAUDE.md                        # ← Pääkonteksti (luotu)
├── client/CLAUDE.md                 # Django-spesifinen konteksti (vapaaehtoinen)
├── grpc_microservices/CLAUDE.md     # Mikropalvelujen konteksti (vapaaehtoinen)
└── k8s/CLAUDE.md                    # K8s-deployment konteksti (vapaaehtoinen)
```

---

## 4. Suositellut ensitoimet ennen Claude Code -agenttitiimin käynnistämistä

```
Prioriteetti 1 (tee nyt):
☐ Vaihda OpenAI API-avain (se on vuotanut tähän chattiin)
☐ Kopioi CLAUDE.md projektin juureen
☐ Lisää .env .gitignore:en (jos ei jo ole)
☐ Tarkista onko .env commitoitu gitiin → jos on, poista historiasta

Prioriteetti 2 (tee ennen Vaihetta 0):
☐ Lähetä puuttuvat tiedostot: röntgenanalyysikoodi, orthanc.json
☐ Vastaa yllä oleviin kysymyksiin (kohta 2)

Prioriteetti 3 (tee ennen Vaihetta 3):
☐ Hanki DICOM-testikuvat: US, XR, CT (anonyymisoituja)
☐ Kerää commissioning-referenssidataa toleranssitaulua varten
```

---

## 5. Claude Code -agentin käynnistysesimerkki

Kun CLAUDE.md on paikallaan ja puuttuvat tiedostot lisätty:

```bash
# Vaihe 0: Auditointi ja siivoaminen
cd autoqad/
claude "Lue CLAUDE.md ja tee koodikatsaus. Poista kommentoitu koodi, 
korvaa print() → logging, päivitä .gitignore, poista VirtualEnvVersion/."

# Vaihe 1: Tietoturva
claude "Siirrä kaikki kovakoodatut salaisuudet ympäristömuuttujiin. 
Luo .env.example. Poista @csrf_exempt. Lisää @login_required."
```

Claude Code lukee automaattisesti CLAUDE.md:n ja ymmärtää projektin kontekstin
ilman että sinun tarvitsee selittää rakennetta joka kerta uudelleen.
