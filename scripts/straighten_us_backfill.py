r"""Backfill: suorista konveksit US-kuvat ja tallenna ne DERIVED Secondary Capture
-DICOMeina takaisin Orthanciin, linkitä ultrasound.straightened_instance-sarakkeeseen.

- Suoristus: importtaa analyysin imageQualityUS (is_convex + transform_convex_image2linear)
  -> näkyy TÄSMÄLLEEN analyysin tuottama suoristettu kuva. EI muokkaa analyysipalvelua.
- Tallennus: Modality=SC + ImageType=DERIVED\SECONDARY -> US-analyysipalvelu (suodattaa
  Modality==US) OHITTAA sen, ei uudelleenanalyysiä. Identifioivat tagit kopioidaan,
  viittaus alkuperäiseen (ReferencedImageSequence).
- Vain konveksit suoristetaan (kuten analyysi); lineaariset jätetään (NULL).

Käyttö:
    python scripts/straighten_us_backfill.py --dry-run            # ei kirjoita mitään
    python scripts/straighten_us_backfill.py --instance <orthanc_uuid>   # yksi
    python scripts/straighten_us_backfill.py --limit 5            # ensimmäiset 5
    python scripts/straighten_us_backfill.py                      # kaikki (joilla NULL)
"""
import argparse
import io
import os
import sys
from pathlib import Path

import numpy as np
import cv2
import requests
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import generate_uid, SecondaryCaptureImageStorage, ExplicitVRLittleEndian
import psycopg2

# Projektin juurihakemisto ja US-analyysipalvelun hakemisto. Lisätään analyysikoodin
# polku sys.pathiin, jotta voidaan importata TÄSMÄLLEEN sama analyysiluokka jota
# varsinainen palvelu käyttää (ei kopioida logiikkaa -> suoristus pysyy identtisenä).
ROOT = Path(__file__).resolve().parent.parent
ANALYZE = ROOT / "services" / "Analyze_service"
sys.path.insert(0, str(ANALYZE))
sys.path.insert(0, str(ANALYZE / "utils"))
from US_IQ_analysis3 import imageQualityUS  # noqa: E402


def load_env():
    # Lue projektin juuren .env-tiedosto yksinkertaiseksi avain->arvo-sanakirjaksi
    # (DB- ja Orthanc-salasanat). Kommenttirivit (#) ohitetaan.
    env = {}
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


ENV = load_env()
ORTHANC = "http://localhost:18042"
AUTH = (ENV.get("ORTHANC_USERNAME", "admin"), ENV.get("ORTHANC_PASSWORD", ""))
PG = dict(host="localhost", port=15432, dbname="QA-results",
          user="postgres", password=ENV.get("DATABASE_PASSWORD", ""))


def fetch_dicom(orthanc_uuid):
    r = requests.get(f"{ORTHANC}/instances/{orthanc_uuid}/file", auth=AUTH, timeout=30)
    r.raise_for_status()
    return r.content


def to_gray(arr):
    if arr.ndim == 3:
        return np.mean(arr, axis=2)
    return arr


def straighten(dicom_bytes):
    """Palauta (ds, is_convex, straightened_u8 | None).

    Käyttää ALKUPERÄISTÄ analyysiä (kuten Analyze_service):
        imageQualityUS(ds, bytes, arr, "probe-LUT.xls").MAIN_US_analysis()['im_t']
    -> TÄSMÄLLEEN sama suoristettu kuva josta profiilit (horiz/vert) lasketaan,
    joten näyttö ja profiilioverlay täsmäävät. Vain konveksit (is_convex)."""
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), force=True)
    analyzer = imageQualityUS(ds, dicom_bytes, ds.pixel_array, "probe-LUT.xls")
    # Vain konveksit (kaarevat) anturit suoristetaan; lineaarisia ei muunneta.
    if not analyzer.is_convex(ds.pixel_array):
        return ds, False, None
    # Aja täysi analyysi ja ota siitä suoristettu kuva "im_t".
    result = analyzer.MAIN_US_analysis()
    im_t = np.asarray(result["im_t"]).astype(np.float32)
    # Normalisoi 8-bittiseksi harmaasävykuvaksi (0..255) näyttöä/tallennusta varten.
    u8 = cv2.normalize(im_t, None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
    return ds, True, u8


def build_sc_dicom(orig_ds, straight_u8):
    """Rakenna DERIVED Secondary Capture -DICOM suoristetusta kuvasta."""
    new_sop = generate_uid()
    fm = FileMetaDataset()
    fm.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    fm.MediaStorageSOPInstanceUID = new_sop
    fm.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(None, {}, file_meta=fm, preamble=b"\x00" * 128)

    # kopioi identifioivat tagit alkuperäisestä
    for tag in ("PatientID", "PatientName", "PatientBirthDate", "PatientSex",
                "StudyInstanceUID", "StudyDate", "StudyTime", "StudyID",
                "AccessionNumber", "ReferringPhysicianName",
                "StationName", "InstitutionName", "InstitutionalDepartmentName",
                "Manufacturer", "ManufacturerModelName", "DeviceSerialNumber"):
        if tag in orig_ds:
            setattr(ds, tag, getattr(orig_ds, tag))

    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = new_sop
    ds.SeriesInstanceUID = generate_uid()          # uusi sarja johdannaiselle
    ds.Modality = "SC"                              # -> US-analyysi ohittaa
    ds.ConversionType = "WSD"
    ds.ImageType = ["DERIVED", "SECONDARY"]
    ds.SeriesDescription = "STRAIGHTENED US (derived)"
    ds.SeriesNumber = 9001
    ds.InstanceNumber = 1

    # viittaus alkuperäiseen
    ref = Dataset()
    ref.ReferencedSOPClassUID = orig_ds.get("SOPClassUID", "")
    ref.ReferencedSOPInstanceUID = orig_ds.get("SOPInstanceUID", "")
    ds.ReferencedImageSequence = [ref]

    # pikselit (8-bit harmaa)
    arr = np.ascontiguousarray(straight_u8.astype(np.uint8))
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows, ds.Columns = arr.shape
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = arr.tobytes()
    ds.is_little_endian = True
    ds.is_implicit_VR = False

    buf = io.BytesIO()
    ds.save_as(buf, write_like_original=False)
    return buf.getvalue(), new_sop


def push_to_orthanc(dicom_bytes):
    # Lähetä valmis suoristettu SC-DICOM Orthanciin ja palauta sen uusi Orthanc-UUID.
    r = requests.post(f"{ORTHANC}/instances", data=dicom_bytes, auth=AUTH,
                      headers={"Content-Type": "application/dicom"}, timeout=30)
    r.raise_for_status()
    return r.json().get("ID")  # Orthanc UUID


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--instance", help="käsittele vain tämä Orthanc-UUID")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="uudelleenkäsittele vaikka linkki on")
    args = ap.parse_args()

    # MAIN_US_analysis lataa "probe-LUT.xls" suhteellisena ja kirjoittaa temp-tiedoston
    os.chdir(str(ANALYZE))

    conn = psycopg2.connect(**PG)
    cur = conn.cursor()
    # Valitaan käsiteltävät rivit ultrasound-taulusta. Joko yksi annettu instanssi,
    # tai kaikki joilta suoristettu kuva vielä puuttuu (ellei --force anneta).
    cols = "instance, tranducertype, straightened_instance"
    if args.instance:
        cur.execute(f"SELECT {cols} FROM ultrasound WHERE instance=%s", (args.instance,))
    else:
        q = f"SELECT {cols} FROM ultrasound WHERE instance IS NOT NULL AND instance != ''"
        if not args.force:
            q += " AND (straightened_instance IS NULL OR straightened_instance = '')"
        q += " ORDER BY processed_at DESC NULLS LAST"
        if args.limit:
            q += f" LIMIT {args.limit}"
        cur.execute(q)
    rows = cur.fetchall()
    print(f"Käsiteltäviä instansseja: {len(rows)}  (dry_run={args.dry_run})")

    # Laskurit: suoristetut konveksit / ohitetut lineaariset / virheet.
    n_conv = n_lin = n_err = 0
    for instance, ttype, old_straight in rows:
        try:
            # 1) Hae alkuperäinen DICOM Orthancista ja 2) suorista (jos konveksi).
            dicom_bytes = fetch_dicom(instance)
            orig_ds, conv, straight_u8 = straighten(dicom_bytes)
            if not conv:
                n_lin += 1
                print(f"  LINEAR  {instance[:20]} ({ttype}) — ohitetaan")
                continue
            print(f"  CONVEX  {instance[:20]} ({ttype}) — suoristettu {straight_u8.shape}", end="")
            if args.dry_run:
                print("  [dry-run, ei tallenneta]")
                n_conv += 1
                continue
            # poista vanha SC-instanssi Orthancista (uudelleenajossa) ettei jää roskaa
            if old_straight:
                try:
                    requests.delete(f"{ORTHANC}/instances/{old_straight}", auth=AUTH, timeout=20)
                except Exception:
                    pass
            # 3) Rakenna SC-DICOM, 4) lähetä Orthanciin, 5) linkitä DB-sarakkeeseen.
            sc_bytes, new_sop = build_sc_dicom(orig_ds, straight_u8)
            new_id = push_to_orthanc(sc_bytes)
            cur.execute("UPDATE ultrasound SET straightened_instance=%s WHERE instance=%s",
                        (new_id, instance))
            conn.commit()
            print(f"  -> Orthanc {new_id[:20]} (linkitetty)")
            n_conv += 1
        except Exception as e:
            n_err += 1
            print(f"  VIRHE {instance[:20]}: {e}")
    cur.close(); conn.close()
    print(f"\nValmis. Konvekseja suoristettu: {n_conv}, lineaarisia ohitettu: {n_lin}, virheitä: {n_err}")


if __name__ == "__main__":
    main()
