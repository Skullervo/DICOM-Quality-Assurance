"""Ingestion-palvelun asetukset (ympäristömuuttujat)."""
import os


class Settings:
    # Orthanc REST
    ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
    ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "admin")
    ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "")

    # MS SQL Server (sama QA-results-kanta kuin muilla palveluilla)
    DB = {
        "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
        "port": os.getenv("DATABASE_PORT", "1433"),
        "user": os.getenv("DATABASE_USER", "sa"),
        "password": os.getenv("DATABASE_PASSWORD", ""),
        "database": os.getenv("DATABASE_NAME", "QA-results"),
    }

    PORT = int(os.getenv("PORT", "8000"))

    # Modaliteettikartoitus: DICOM Modality -> (job-taulu, rakeisuus)
    #   US  -> us_jobs,  per instanssi
    #   CR/DX -> xray_jobs, per sarja
    #   CT  -> ct_jobs,  per sarja
    MODALITY_US = {"US"}
    MODALITY_XR = {"CR", "DX"}
    MODALITY_CT = {"CT"}


settings = Settings()

def orthanc_auth():
    return (settings.ORTHANC_USERNAME, settings.ORTHANC_PASSWORD) if settings.ORTHANC_USERNAME else None
