"""AutoQAD — Orthanc Python-plugin webhook (manuscript §2.2.1 -> §2.2.2).

Vaihtoehto Lua-skriptille: kun study on vakaa (StableStudy), POST ingestion-
palvelulle, joka enumeroi studyn ja luo QA-jobit. Käyttää Pythonin urllib:iä,
koska Orthancin sisäänrakennettu Lua-HTTP-client ei saa ulosmeneviä pyyntöjä
läpi kaikissa ympäristöissä.

Käyttö (orthanc.json):
  "Plugins": ["/usr/local/share/orthanc/plugins/libOrthancPython.so"],
  "PythonScript": "/etc/orthanc/autoqad_ingest.py"
INGESTION_URL voidaan yliajaa ympäristömuuttujalla.
"""
import os
import json
import urllib.request

# "orthanc"-moduuli on Orthancin Python-pluginin tarjoama rajapinta. Se on käytettävissä
# vain kun tämä skripti ajetaan Orthancin sisällä (ei normaalina Python-ohjelmana).
import orthanc

# Osoite johon webhook lähetetään. Oletuksena kontin sisäverkossa oleva ingestion-palvelu.
INGESTION_URL = os.getenv("INGESTION_URL", "http://ingestion-service:8000/webhook/study")


# Orthanc kutsuu tätä funktiota jokaisesta muutostapahtumasta. Reagoidaan vain
# STABLE_STUDY-tapahtumaan: study on "vakaa" kun siihen ei ole tullut uusia kuvia
# tiettyyn aikaan -> kaikki studyn kuvat ovat todennäköisesti saapuneet.
def on_change(change_type, level, resource_id):
    if change_type == orthanc.ChangeType.STABLE_STUDY:
        try:
            # Rakennetaan JSON-runko: resource_id on studyn Orthanc-tunniste,
            # jonka ingestion-palvelu enumeroi ja muuntaa QA-jobeiksi.
            data = json.dumps({
                "resource_id": resource_id,
                "change_type": "StableStudy",
                "level": "Study",
            }).encode("utf-8")
            # POST ingestion-palvelulle (urllib, koska Orthancin Lua-HTTP ei ole luotettava).
            req = urllib.request.Request(
                INGESTION_URL, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                print("AutoQAD: ingestion notified for study %s (HTTP %s)"
                      % (resource_id, resp.status))
        except Exception as e:  # noqa: BLE001 — virhe ei saa kaataa Orthancia
            # Jos ingestion ei vastaa, logitetaan vain — Orthanc jatkaa normaalisti.
            print("AutoQAD: ingestion POST failed for study %s: %s" % (resource_id, e))


# Rekisteröi yllä oleva funktio Orthancin muutostapahtumien käsittelijäksi.
# Tämä rivi suoritetaan kerran kun Orthanc lataa pluginin käynnistyessään.
orthanc.RegisterOnChangeCallback(on_change)
print("AutoQAD: ingestion webhook plugin loaded (target=%s)" % INGESTION_URL)
