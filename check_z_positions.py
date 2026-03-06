"""Diagnostic script to check z-positions of CT instances in Orthanc."""
import requests

ORTHANC = "http://localhost:8042"
AUTH = ("admin", "admin")

series_id = "e3eab0e7-0c0f4c1e-be823136-4f6765ec-a7b8f419"
instances = requests.get(f"{ORTHANC}/series/{series_id}/instances", auth=AUTH).json()

zdata = []
for inst in instances:
    tags = requests.get(
        f"{ORTHANC}/instances/{inst['ID']}/simplified-tags", auth=AUTH
    ).json()
    inst_num = int(tags.get("InstanceNumber", 0))
    ipp = tags.get("ImagePositionPatient", "")
    if ipp:
        # ImagePositionPatient is "x\\y\\z" in simplified-tags
        sep = "\\" if "\\" in ipp else " "
        parts = ipp.split(sep)
        z = float(parts[-1])
    else:
        z = None
    zdata.append((inst_num, z))

# Sort by instance number
zdata.sort(key=lambda x: x[0])

print("=== Sorted by Instance Number ===")
print("First 5:")
for d in zdata[:5]:
    print(f"  Instance {d[0]}: z={d[1]}")

print("\nAround instance 97:")
for d in zdata:
    if 95 <= d[0] <= 99:
        print(f"  Instance {d[0]}: z={d[1]}")

print("\nAround instance 209 (origin):")
for d in zdata:
    if 207 <= d[0] <= 211:
        print(f"  Instance {d[0]}: z={d[1]}")

print("\nLast 5:")
for d in zdata[-5:]:
    print(f"  Instance {d[0]}: z={d[1]}")

# Sort by z-position
zdata_z = sorted(zdata, key=lambda x: x[1] if x[1] is not None else 0)
print(f"\nMin z: instance {zdata_z[0][0]}, z={zdata_z[0][1]}")
print(f"Max z: instance {zdata_z[-1][0]}, z={zdata_z[-1][1]}")

# Closest to expected CTP528 position
target = -67.0
closest = min(zdata_z, key=lambda x: abs(x[1] - target) if x[1] else 999)
print(f"Closest to z={target}: instance {closest[0]}, z={closest[1]}")

# What pylinac sees: origin at slice 209 (0-indexed in pylinac z-sorted order)
# pylinac sorts by z ascending
print(f"\n=== Pylinac perspective ===")
print(f"Pylinac slice 0 (lowest z): instance {zdata_z[0][0]}, z={zdata_z[0][1]}")
print(f"Pylinac slice 209: instance {zdata_z[209][0]}, z={zdata_z[209][1]}")
print(f"Pylinac slice 228 (highest z): instance {zdata_z[228][0]}, z={zdata_z[228][1]}")

origin_z = zdata_z[209][1]
print(f"\nOrigin z = {origin_z}")
print(f"CTP528 expected at z = {origin_z} + 30 = {origin_z + 30}")
print(f"Max z in scan = {zdata_z[228][1]}")
print(f"Gap = {origin_z + 30 - zdata_z[228][1]:.1f} mm")
