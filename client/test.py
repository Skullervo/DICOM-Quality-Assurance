import requests
import pydicom
import matplotlib.pyplot as plt
from io import BytesIO

# Orthancin osoite ja tunnukset
ORTHANC_URL = 'http://localhost:8042'
USERNAME = 'orthanc'
PASSWORD = 'orthanc'

# Aseta tähän jonkin DICOM-instanssin ID Orthancista
instance_id = '1eceaab8-3403a114-d8d3ec5d-3c049aaa-af7e0c43'

# Pyydä DICOM-tiedosto Orthancista
url = f'{ORTHANC_URL}/instances/{instance_id}/file'
response = requests.get(url, auth=(USERNAME, PASSWORD))

# Tarkista onnistuiko pyyntö
if response.status_code == 200:
    # Lue DICOM-tiedosto muistista
    dicom_file = BytesIO(response.content)
    ds = pydicom.dcmread(dicom_file)
    print()

    # Visualisoi kuva
    plt.imshow(ds.pixel_array, cmap='gray')
    plt.title('DICOM Image')
    plt.axis('off')
    plt.show()
    print(ds.PhotometricInterpretation)
    print(ds.SOPClassUID)

else:
    print(f"Virhe ladattaessa tiedostoa: {response.status_code}")
