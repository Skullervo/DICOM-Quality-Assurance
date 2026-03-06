"""Test CatPhan auto-detection with the 229-slice series."""
import os
import sys
import tempfile
import shutil
import requests
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "grpc_microservices", "CT_analyze_service"))
from catphan_analyzer import _detect_catphan_model, CatphanAnalyzer

ORTHANC = "http://localhost:8042"
AUTH = ("admin", "admin")
SERIES_ID = "e3eab0e7-0c0f4c1e-be823136-4f6765ec-a7b8f419"

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")


def download_series(series_id, dest_dir):
    instances = requests.get(f"{ORTHANC}/series/{series_id}/instances", auth=AUTH).json()
    print(f"Downloading {len(instances)} instances...")
    for idx, inst in enumerate(instances):
        resp = requests.get(f"{ORTHANC}/instances/{inst['ID']}/file", auth=AUTH)
        dcm_path = os.path.join(dest_dir, f"slice_{idx:04d}.dcm")
        with open(dcm_path, "wb") as f:
            f.write(resp.content)
    return len(instances)


def main():
    temp_dir = tempfile.mkdtemp(prefix="catphan_test_")
    print(f"Temp dir: {temp_dir}")
    try:
        n = download_series(SERIES_ID, temp_dir)
        print(f"Downloaded {n} files")

        # Test auto-detection
        print("\n=== Auto-detection ===")
        model = _detect_catphan_model(temp_dir)
        print(f"Detected model: {model}")

        # Test full analysis with auto model
        print(f"\n=== Running analysis with model={model} ===")
        analyzer = CatphanAnalyzer(temp_dir, phantom_model='auto')
        print(f"Analyzer chose model: {analyzer.phantom_model}")
        result = analyzer.analyze()
        metrics = CatphanAnalyzer.extract_metrics(result['results'])

        print(f"\n=== Key results ===")
        print(f"MTF 50%: {metrics.get('mtf_50_percent')}")
        print(f"MTF 10%: {metrics.get('mtf_10_percent')}")
        print(f"CTP528 pass: {metrics.get('ctp528_pass')}")
        print(f"HU acrylic: {metrics.get('hu_acrylic')}")
        print(f"Uniformity index: {metrics.get('uniformity_index')}")
        print(f"Overall pass: {metrics.get('overall_pass')}")

        images = result.get('images', {})
        print(f"\n=== Generated images ===")
        for key, data in images.items():
            print(f"  {key}: {len(data)} bytes")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"\nCleaned up {temp_dir}")


if __name__ == "__main__":
    main()
