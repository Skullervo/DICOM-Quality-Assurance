"""AutoQAD Ingestion Service (manuscript §2.2.2).

Muuntaa Orthancin DICOM-tapahtumat QA-tehtäviksi (jobeiksi). FastAPI-palvelu
vastaanottaa webhookin, enumeroi studyn Orthancin REST-API:lla ja luo
modality-spesifiset QUEUED-jobit, jotka Service Broker -trigger lähettää edelleen
analyysi-workereille.
"""
import logging
from fastapi import FastAPI

from .config import settings
from .routes import webhook

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

app = FastAPI(title="AutoQAD Ingestion Service", version="1.0.0")
app.include_router(webhook.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ingestion"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
