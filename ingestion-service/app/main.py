"""AutoQAD Ingestion Service (manuscript §2.2.2).

Muuntaa Orthancin DICOM-tapahtumat QA-tehtäviksi (jobeiksi). FastAPI-palvelu
vastaanottaa webhookin, enumeroi studyn Orthancin REST-API:lla ja luo
modality-spesifiset QUEUED-jobit, jotka Service Broker -trigger lähettää edelleen
analyysi-workereille.
"""
import logging
from fastapi import FastAPI

# settings = ympäristömuuttujista luetut asetukset (Orthanc-osoite, DB-tiedot, portti).
# webhook = reititin, joka sisältää varsinaisen /webhook/study-endpointin.
from .config import settings
from .routes import webhook

# Lokitus INFO-tasolle: palvelun tapahtumat (luodut jobit, virheet) näkyvät
# kontin logissa (podman logs / kubectl logs). Ei kirjoita tiedostoon.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

# Luodaan FastAPI-sovellus ja kytketään webhook-reitit siihen.
app = FastAPI(title="AutoQAD Ingestion Service", version="1.0.0")
app.include_router(webhook.router)


# Terveystarkistus-endpoint. Kubernetes/Podman ja kuormantasaaja kutsuvat tätä
# varmistaakseen että palvelu on pystyssä. Palauttaa aina 200 OK jos prosessi elää.
@app.get("/health")
def health():
    return {"status": "ok", "service": "ingestion"}


# Suora ajo (python -m app.main): käynnistetään uvicorn-palvelin. Kontissa
# käynnistys tapahtuu Containerfilen CMD-rivillä, ei tämän kautta.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
