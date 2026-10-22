"""
Kevyt FastAPI-palvelu ultraäänikuvan rajaamiseen (autoqad-image-service, portti 8090).

Mihin tätä käytetään: Go-backend/React tarvitsee näytettäväksi US-laitesivulle
ultraäänikuvan, josta on rajattu pois reunojen annotaatiot (tekstit, mittarit).
Tämä palvelu hakee raaka-DICOM-tiedoston Orthancista, purkaa pikselidatan, rajaa
ultraäänialueen (sama logiikka kuin vanhan Django-version utils.py:n modifyUS) ja
palauttaa sen PNG-kuvana base64-koodattuna.

Rajapinta: GET /us/image/{instance_id}
Vastaus:   JSON { "image": base64_png, "mime": "image/png" }
"""

import os
import sys
import base64
import logging
from io import BytesIO

import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import pydicom

# US-kuvan rajauslogiikka (modifyUS) on irrotettu omaksi moduuliksi us_crop.py
# (aiemmin osa Djangon client/qa_core/utils.py:tä). Näin image-service on itsenäinen
# eikä riipu Djangosta.
from us_crop import modifyUS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("image-service")

# FastAPI-sovellusolio; uvicorn käynnistää tämän (ks. Containerfile).
app = FastAPI(title="AutoQAD Image Service", version="1.0")

# Orthanc-yhteys luetaan ympäristömuuttujista (oletukset sopivat konttiverkkoon).
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USER = os.getenv("ORTHANC_USERNAME", "admin")
ORTHANC_PASS = os.getenv("ORTHANC_PASSWORD", "")


def dicom_to_uint8(arr: np.ndarray) -> np.ndarray:
    """Normalisoi mielivaltainen pikselitaulukko 0-255 uint8:ksi PNG-tallennusta varten."""
    arr = arr.astype(np.float32)
    rng = np.ptp(arr)          # vaihteluväli (max - min)
    if rng == 0:
        # Tasainen kuva (kaikki pikselit samat) -> palauta musta, vältä nollalla jako.
        return np.zeros_like(arr, dtype=np.uint8)
    # Venytä arvot välille 0..255 (min -> 0, max -> 255).
    return (255 * (arr - arr.min()) / rng).astype(np.uint8)


def crop_us_image(dicom_bytes: bytes) -> np.ndarray:
    """
    Pura ja rajaa ultraäänialue raaka-DICOM-tavuista. Käyttää modifyUS-luokkaa (us_crop.py),
    joka tunnistaa varsinaisen kaikukuvan ja poistaa reunojen annotaatiot.
    """
    try:
        ds = pydicom.dcmread(BytesIO(dicom_bytes), force=True)
        pixel_array = ds.pixel_array

        # Aja sama rajausputki kuin Django-versiossa (modifyUS.modify()).
        cropped = modifyUS("", dicom_bytes, pixel_array, None).modify()
        return dicom_to_uint8(cropped)
    except Exception as e:
        # Jos rajaus epäonnistuu (esim. poikkeava kuvamuoto), ei kaadeta pyyntöä:
        # palautetaan raaka kuva ilman rajausta.
        logger.warning(f"modifyUS failed, falling back to raw pixel_array: {e}")
        ds = pydicom.dcmread(BytesIO(dicom_bytes), force=True)
        arr = ds.pixel_array
        if arr.ndim == 3:
            # Värikuva -> harmaasävyksi keskiarvoistamalla kanavat.
            arr = np.mean(arr, axis=2)
        return dicom_to_uint8(arr)


def encode_png_base64(arr: np.ndarray) -> str:
    """Koodaa numpy-taulukko PNG:ksi ja edelleen base64-merkkijonoksi (JSONiin sopiva)."""
    from PIL import Image
    if arr.ndim == 2:
        img = Image.fromarray(arr, mode='L')   # 2D -> harmaasävy
    else:
        img = Image.fromarray(arr)             # 3D -> väri
    buf = BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()


@app.get("/health")
def health():
    # Terveystarkistus (Kubernetes/Go-backend voi pingata tätä).
    return {"status": "ok", "service": "image-service"}


def resolve_orthanc_id(instance_id: str) -> str:
    """
    Muunna DICOM SOP Instance UID TAI Orthanc-UUID Orthancin sisäiseksi instanssi-UUID:ksi.
    Orthanc-UUID on muotoa 8-4-4-4-8 (heksa), kun taas DICOM-UID sisältää pisteitä — tästä
    erotetaan kumpi tunniste on kyseessä.
    """
    if '.' in instance_id:
        # Piste -> kyseessä on DICOM SOP Instance UID; etsitään vastaava instanssi Orthancista.
        search_url = f"{ORTHANC_URL}/tools/find"
        resp = requests.post(search_url, auth=(ORTHANC_USER, ORTHANC_PASS),
                             json={"Level": "Instance", "Query": {"SOPInstanceUID": instance_id}},
                             timeout=10)
        resp.raise_for_status()
        results = resp.json()
        if not results:
            raise HTTPException(status_code=404, detail=f"Instance not found in Orthanc: {instance_id}")
        return results[0]  # Orthancin UUID
    return instance_id  # Oli jo Orthanc-UUID


@app.get("/us/image/{instance_id}")
def get_us_image(instance_id: str):
    """Hae DICOM Orthancista, rajaa US-alue ja palauta PNG base64:na."""
    # 1) Selvitä Orthanc-UUID ja hae raaka-DICOM-tiedosto.
    try:
        orthanc_uuid = resolve_orthanc_id(instance_id)
        url = f"{ORTHANC_URL}/instances/{orthanc_uuid}/file"
        resp = requests.get(url, auth=(ORTHANC_USER, ORTHANC_PASS), timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        # Orthanc ei vastannut / kuvaa ei löytynyt -> 502 (Bad Gateway).
        logger.error(f"Orthanc fetch failed: {e}")
        raise HTTPException(status_code=502, detail=f"Orthanc fetch failed: {e}")

    # 2) Rajaa ultraäänikuva.
    try:
        cropped = crop_us_image(resp.content)
    except Exception as e:
        logger.error(f"Image processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {e}")

    # 3) Koodaa PNG base64:ksi ja palauta JSONina.
    img_b64 = encode_png_base64(cropped)
    return JSONResponse({
        "image": img_b64,
        "mime": "image/png",
    })
