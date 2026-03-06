"""Diagnostic script: check what pylinac sees in the CatPhan DICOM series."""
import os
import sys
import tempfile
import shutil
import requests
import pydicom
from pathlib import Path

from pylinac import CatPhan504
from pylinac.ct import z_position

ORTHANC = "http://localhost:8042"
AUTH = ("admin", "admin")
SERIES_ID = "e3eab0e7-0c0f4c1e-be823136-4f6765ec-a7b8f419"  # 229-slice series


def download_series(series_id, dest_dir):
    """Download all instances of a series from Orthanc."""
    instances = requests.get(
        f"{ORTHANC}/series/{series_id}/instances", auth=AUTH
    ).json()
    print(f"Downloading {len(instances)} instances...")

    instance_map = {}  # pydicom instance_number -> orthanc instance id
    for idx, inst in enumerate(instances):
        resp = requests.get(
            f"{ORTHANC}/instances/{inst['ID']}/file", auth=AUTH
        )
        dcm_path = os.path.join(dest_dir, f"slice_{idx:04d}.dcm")
        with open(dcm_path, "wb") as f:
            f.write(resp.content)

        ds = pydicom.dcmread(dcm_path, stop_before_pixels=True, force=True)
        inst_num = int(ds.get("InstanceNumber", 0))
        z = float(ds.ImagePositionPatient[2])
        instance_map[idx] = {
            "instance_number": inst_num,
            "z": z,
            "orthanc_id": inst["ID"],
        }

    return instance_map


def main():
    temp_dir = tempfile.mkdtemp(prefix="catphan_diag_")
    print(f"Temp dir: {temp_dir}")

    try:
        # 1. Download DICOM files
        instance_map = download_series(SERIES_ID, temp_dir)

        # 2. Load in pylinac
        print("\n=== Loading CatPhan504 ===")
        cat = CatPhan504(temp_dir)

        # Apply fixes (same as our analyzer)
        fov_mm = cat.dicom_stack.metadata.Columns * cat.mm_per_pixel
        phantom_diameter_mm = 2 * cat.catphan_radius_mm
        if phantom_diameter_mm / fov_mm > 0.85:
            print(f"Phantom fills {phantom_diameter_mm/fov_mm*100:.0f}% of FOV, disabling clear_borders")
            cat.clear_borders = False

        # Set required attributes before find_phantom_axis
        cat.x_adjustment = 0
        cat.y_adjustment = 0
        cat.angle_adjustment = 0
        cat.roi_size_factor = 1
        cat.scaling_factor = 1

        # 3. Find phantom axis and origin
        cat._phantom_center_func = cat.find_phantom_axis()
        origin = cat.find_origin_slice()
        cat.origin_slice = origin

        print(f"\nOrigin slice (pylinac index): {origin}")

        # 4. Check z-positions
        z_positions = [z_position(m) for m in cat.dicom_stack.metadatas]
        min_z = min(z_positions)
        max_z = max(z_positions)
        print(f"Z range: {min_z} to {max_z} (span={max_z-min_z:.1f} mm)")
        print(f"Number of slices: {len(z_positions)}")

        # Origin z
        origin_z = cat.dicom_stack[origin].z_position
        print(f"Origin z-position: {origin_z}")

        # What DICOM InstanceNumber is origin?
        origin_inst_num = None
        for idx, info in instance_map.items():
            if abs(info["z"] - origin_z) < 0.1:
                origin_inst_num = info["instance_number"]
                break
        print(f"Origin DICOM InstanceNumber: {origin_inst_num}")

        # 5. Check each module
        print("\n=== Module Z-Positions ===")
        for mod_class, config in CatPhan504.modules.items():
            offset = config["offset"]
            mod_z = origin_z + offset
            in_range = min_z <= mod_z <= max_z

            # Find closest DICOM instance
            closest_inst = None
            closest_dist = 999
            for idx, info in instance_map.items():
                dist = abs(info["z"] - mod_z)
                if dist < closest_dist:
                    closest_dist = dist
                    closest_inst = info["instance_number"]

            print(f"  {mod_class.__name__}:")
            print(f"    offset={offset:+.0f}mm, expected z={mod_z:.1f}")
            print(f"    in scan range: {in_range}")
            print(f"    closest DICOM instance: {closest_inst} (dist={closest_dist:.1f}mm)")

        # 6. Check what's at DICOM instance 97
        inst97_z = None
        for idx, info in instance_map.items():
            if info["instance_number"] == 97:
                inst97_z = info["z"]
                break
        if inst97_z is not None:
            print(f"\n=== Instance 97 ===")
            print(f"  z-position: {inst97_z}")
            print(f"  offset from origin: {inst97_z - origin_z:.1f} mm")

            # Which pylinac slice index?
            for i, z in enumerate(sorted(z_positions)):
                if abs(z - inst97_z) < 0.1:
                    print(f"  pylinac slice index: {i}")
                    break

        # 7. Try to find the actual CTP528 slice by checking line pair patterns
        # Check z-position ordering
        print(f"\n=== Z-position ordering check ===")
        sorted_z = sorted(z_positions)
        print(f"  pylinac slice 0: z={sorted_z[0]}")
        print(f"  pylinac slice {origin}: z={sorted_z[origin]}")
        print(f"  pylinac slice {len(sorted_z)-1}: z={sorted_z[-1]}")
        print(f"  z ascending: {sorted_z[0] < sorted_z[-1]}")

        # 8. Also check if pylinac's z_position differs from DICOM ImagePositionPatient
        print(f"\n=== pylinac z_position vs DICOM IPP ===")
        first_meta = cat.dicom_stack.metadatas[0]
        print(f"  pylinac z_position(first): {z_position(first_meta)}")
        # Check a few slices
        for sl_idx in [0, 1, origin, len(z_positions)-1]:
            pz = z_position(cat.dicom_stack.metadatas[sl_idx])
            dz = cat.dicom_stack[sl_idx].z_position
            print(f"  slice {sl_idx}: pylinac_z={pz}, stack_z={dz}")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        print(f"\nCleaned up {temp_dir}")


if __name__ == "__main__":
    main()
