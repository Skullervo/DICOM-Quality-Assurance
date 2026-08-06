"""
Kevyt FastAPI-palvelu ultraäänikuvan rajaamiseen.

Hakee raaka-DICOM-tiedoston Orthancista, purkaa pikselidatan,
rajaa ultraäänialueen (poistaa annotaatiot) käyttäen samaa
logiikkaa kuin Django-version utils.py:n modifyUS.

Endpoint: GET /us/image/{instance_id}
Returns: JSON { "image": base64_png, "mime": "image/png" }
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

# US-kuvan rajaus (modifyUS) on irrotettu omaksi moduuliksi us_crop.py
# (aiemmin client/qa_core/utils.py). Image-service on nyt itsenäinen, ei riipu Djangosta.
from us_crop import modifyUS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("image-service")

app = FastAPI(title="AutoQAD Image Service", version="1.0")

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USER = os.getenv("ORTHANC_USERNAME", "admin")
ORTHANC_PASS = os.getenv("ORTHANC_PASSWORD", "")


def dicom_to_uint8(arr: np.ndarray) -> np.ndarray:
    """Normalize to 0-255 uint8."""
    arr = arr.astype(np.float32)
    rng = np.ptp(arr)
    if rng == 0:
        return np.zeros_like(arr, dtype=np.uint8)
    return (255 * (arr - arr.min()) / rng).astype(np.uint8)


def crop_us_image(dicom_bytes: bytes) -> np.ndarray:
    """
    Extract and crop the ultrasound image region from raw DICOM bytes.
    Uses the modifyUS class (us_crop.py).
    """
    try:
        ds = pydicom.dcmread(BytesIO(dicom_bytes), force=True)
        pixel_array = ds.pixel_array

        # Run the same crop pipeline as Django
        cropped = modifyUS("", dicom_bytes, pixel_array, None).modify()
        return dicom_to_uint8(cropped)
    except Exception as e:
        logger.warning(f"modifyUS failed, falling back to raw pixel_array: {e}")
        # Fallback: return raw pixel data without cropping
        ds = pydicom.dcmread(BytesIO(dicom_bytes), force=True)
        arr = ds.pixel_array
        if arr.ndim == 3:
            arr = np.mean(arr, axis=2)
        return dicom_to_uint8(arr)


def encode_png_base64(arr: np.ndarray) -> str:
    """Encode numpy array as PNG base64."""
    from PIL import Image
    if arr.ndim == 2:
        img = Image.fromarray(arr, mode='L')
    else:
        img = Image.fromarray(arr)
    buf = BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()


@app.get("/health")
def health():
    return {"status": "ok", "service": "image-service"}


def resolve_orthanc_id(instance_id: str) -> str:
    """
    Resolve a DICOM SOP Instance UID or Orthanc UUID to an Orthanc instance UUID.
    Orthanc UUIDs are 8-4-4-4-8 hex format, DICOM UIDs contain dots.
    """
    if '.' in instance_id:
        # It's a DICOM SOP Instance UID — search Orthanc for matching instance
        search_url = f"{ORTHANC_URL}/tools/find"
        resp = requests.post(search_url, auth=(ORTHANC_USER, ORTHANC_PASS),
                             json={"Level": "Instance", "Query": {"SOPInstanceUID": instance_id}},
                             timeout=10)
        resp.raise_for_status()
        results = resp.json()
        if not results:
            raise HTTPException(status_code=404, detail=f"Instance not found in Orthanc: {instance_id}")
        return results[0]  # Orthanc UUID
    return instance_id  # Already an Orthanc UUID


@app.get("/us/image/{instance_id}")
def get_us_image(instance_id: str):
    """Fetch DICOM from Orthanc, crop US region, return as PNG base64."""
    # 1) Resolve to Orthanc UUID and fetch raw DICOM file
    try:
        orthanc_uuid = resolve_orthanc_id(instance_id)
        url = f"{ORTHANC_URL}/instances/{orthanc_uuid}/file"
        resp = requests.get(url, auth=(ORTHANC_USER, ORTHANC_PASS), timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Orthanc fetch failed: {e}")
        raise HTTPException(status_code=502, detail=f"Orthanc fetch failed: {e}")

    # 2) Crop the US image
    try:
        cropped = crop_us_image(resp.content)
    except Exception as e:
        logger.error(f"Image processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {e}")

    # 3) Encode and return
    img_b64 = encode_png_base64(cropped)
    return JSONResponse({
        "image": img_b64,
        "mime": "image/png",
    })
