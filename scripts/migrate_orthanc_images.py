"""
migrate_orthanc_images.py
Kopioi DICOM-kuvat natiivi-Orthancista Docker-Orthanciin.

Käyttö (Windows):
    python scripts/migrate_orthanc_images.py

Käyttö (mukautetuilla osoitteilla):
    python scripts/migrate_orthanc_images.py \
        --src http://localhost:8042 \
        --dst http://localhost:18042
"""

import argparse
import sys
import requests

# --- Oletusasetukset ---
SRC_URL  = "http://localhost:8042"   # Natiivi Orthanc (Windows)
DST_URL  = "http://localhost:18042"  # Docker Orthanc (host-portti)
SRC_AUTH = ("admin", "alice")
DST_AUTH = ("admin", "alice")


def get_all_instances(base_url: str, auth) -> list[str]:
    r = requests.get(f"{base_url}/instances", auth=auth, timeout=10)
    r.raise_for_status()
    return r.json()


def download_instance(base_url: str, auth, instance_id: str) -> bytes:
    r = requests.get(f"{base_url}/instances/{instance_id}/file", auth=auth, timeout=30)
    r.raise_for_status()
    return r.content


def upload_instance(base_url: str, auth, dicom_bytes: bytes) -> dict:
    r = requests.post(
        f"{base_url}/instances",
        data=dicom_bytes,
        auth=auth,
        headers={"Content-Type": "application/dicom"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def get_existing_instances(base_url: str, auth) -> set[str]:
    """Palauttaa jo olemassa olevien instanssien ID:t kohteessa."""
    r = requests.get(f"{base_url}/instances", auth=auth, timeout=10)
    r.raise_for_status()
    return set(r.json())


def main(src_url: str, dst_url: str, src_auth, dst_auth, dry_run: bool = False):
    print(f"Lahde:  {src_url}")
    print(f"Kohde:  {dst_url}")

    # Yhteystesti
    try:
        r = requests.get(f"{src_url}/system", auth=src_auth, timeout=5)
        r.raise_for_status()
        print(f"Lahde OK: Orthanc {r.json().get('Version', '?')}")
    except Exception as e:
        print(f"VIRHE: Ei yhteyttä lähteeseen: {e}")
        sys.exit(1)

    try:
        r = requests.get(f"{dst_url}/system", auth=dst_auth, timeout=5)
        r.raise_for_status()
        print(f"Kohde OK: Orthanc {r.json().get('Version', '?')}")
    except Exception as e:
        print(f"VIRHE: Ei yhteyttä kohteeseen: {e}")
        sys.exit(1)

    src_instances = get_all_instances(src_url, src_auth)
    dst_instances = get_existing_instances(dst_url, dst_auth)

    print(f"\nLähteessä: {len(src_instances)} instanssia")
    print(f"Kohteessa: {len(dst_instances)} instanssia")

    to_migrate = [i for i in src_instances if i not in dst_instances]
    print(f"Siirrettävä: {len(to_migrate)} uutta instanssia\n")

    if dry_run:
        print("[DRY RUN] Ei siirretä oikeasti.")
        return

    ok = 0
    skip = 0
    err = 0

    for idx, inst_id in enumerate(to_migrate, 1):
        try:
            dicom_bytes = download_instance(src_url, src_auth, inst_id)
            result = upload_instance(dst_url, dst_auth, dicom_bytes)
            status = result.get("Status", "?")
            if status == "AlreadyStored":
                skip += 1
                print(f"[{idx}/{len(to_migrate)}] OHITETTU (AlreadyStored): {inst_id}")
            else:
                ok += 1
                print(f"[{idx}/{len(to_migrate)}] OK ({status}): {inst_id}")
        except Exception as e:
            err += 1
            print(f"[{idx}/{len(to_migrate)}] VIRHE: {inst_id}: {e}")

    print(f"\nValmis. Siirretty: {ok}, ohitettu: {skip}, virheitä: {err}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Siirrä DICOM-kuvat Orthancien välillä")
    parser.add_argument("--src", default=SRC_URL, help="Lähde-Orthanc URL")
    parser.add_argument("--dst", default=DST_URL, help="Kohde-Orthanc URL")
    parser.add_argument("--src-user", default=SRC_AUTH[0])
    parser.add_argument("--src-pass", default=SRC_AUTH[1])
    parser.add_argument("--dst-user", default=DST_AUTH[0])
    parser.add_argument("--dst-pass", default=DST_AUTH[1])
    parser.add_argument("--dry-run", action="store_true", help="Näytä mitä siirrettäisiin")
    args = parser.parse_args()

    main(
        src_url=args.src,
        dst_url=args.dst,
        src_auth=(args.src_user, args.src_pass),
        dst_auth=(args.dst_user, args.dst_pass),
        dry_run=args.dry_run,
    )
