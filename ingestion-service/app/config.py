"""Ingestion-palvelun asetukset (ympäristömuuttujat)."""
import os


# Kaikki asetukset luetaan ympäristömuuttujista (os.getenv). Toinen argumentti on
# oletusarvo jos muuttujaa ei ole asetettu. Tuotannossa arvot tulevat .env-tiedostosta
# tai Kubernetes-secreteistä; kehityksessä oletukset riittävät usein sellaisenaan.
class Settings:
    # Orthanc REST -rajapinnan osoite ja kirjautumistiedot. Palvelu hakee DICOM-
    # tiedot Orthancista tämän REST-API:n kautta (ei DICOM-protokollalla).
    ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
    ORTHANC_USERNAME = os.getenv("ORTHANC_USERNAME", "admin")
    ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "")

    # MS SQL Server -yhteys. Sama QA-results-kanta kuin muilla palveluilla —
    # tänne luodaan QA-jobit (us_jobs/xray_jobs/ct_jobs/angio_jobs).
    DB = {
        "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
        "port": os.getenv("DATABASE_PORT", "1433"),
        "user": os.getenv("DATABASE_USER", "sa"),
        "password": os.getenv("DATABASE_PASSWORD", ""),
        "database": os.getenv("DATABASE_NAME", "QA-results"),
    }

    # TCP-portti jota FastAPI-palvelin kuuntelee kontin sisällä.
    PORT = int(os.getenv("PORT", "8000"))

    # Modaliteettikartoitus: DICOM Modality -> (job-taulu, rakeisuus)
    #   US  -> us_jobs,    per instanssi
    #   CR/DX -> xray_jobs, per sarja
    #   CT  -> ct_jobs,     per sarja
    #   XA  -> angio_jobs,  per instanssi (läpivalaisu/angiografia, Leeds TOR-18)
    MODALITY_US = {"US"}
    MODALITY_XR = {"CR", "DX"}
    MODALITY_CT = {"CT"}
    MODALITY_ANGIO = {"XA"}

    # QA-studysuodatus: analysoidaan VAIN laadunvalvonta-/fantomistudyt, EI kliinisiä
    # potilaskuvia. Orthanc voi sisältää paljon natiivi-/potilaskuvia (esim. "Vatsa
    # natiivi", "Lannerangan röntgen"), joille QA-analyysi ei kuulu ajaa. Tunnistus
    # StudyDescriptionin avainsanoilla (pienellä kirjaimella, osumahaku). Datasta johdetut
    # oletukset: "LAATU NATIIVI"/"Laatu UÄ ilmakuva"/"LAATU LÄPIV"/"Laadunvalvonta"/
    # "CT fantom"/"CATPHAN"/"Fantomi-testi"/"Normi 13"/"Fyysikko". Säädä envistä laitoksen
    # nimeämisen mukaan. Tyhjä lista = ei suodatusta (analysoi kaikki, vanha käytös).
    QA_STUDY_KEYWORDS = {
        k.strip().lower()
        for k in os.getenv(
            "QA_STUDY_KEYWORDS",
            "laatu,laadun,fantom,catphan,normi,fyysikko,phantom,tor,leeds,ilmakuva",
        ).split(",")
        if k.strip()
    }

    # CT-sarjasuodatus: CatPhan-analyysi vaatii koko fantomivolyymin (satoja leikkeitä
    # eri moduuleista). Jokainen CT-tutkimus sisältää kuitenkin myös TOPOGRAMMIN/scoutin
    # (1 leike) ja mahdollisesti dose report -sarjan — nämä EIVÄT ole CatPhan-volyymeja,
    # ja jos ne analysoidaan, CatPhan-detektio kaatuu -> Siemens-fallback -> ei kuvia.
    # Ohitetaan CT-sarjat joissa on liian vähän leikkeitä TAI kuvaus on topogrammi/scout/dose.
    CT_MIN_SLICES = int(os.getenv("CT_MIN_SLICES", "20"))
    CT_SKIP_SERIES = {
        k.strip().lower()
        for k in os.getenv(
            "CT_SKIP_SERIES",
            "topogram,topo,scout,localizer,surview,dose report,dose,patient protocol",
        ).split(",")
        if k.strip()
    }


# Yksi jaettu asetusinstanssi, jonka muut moduulit importtaavat.
settings = Settings()

# Palauttaa (käyttäjä, salasana) -parin requests-kirjastolle HTTP Basic -autentikointia
# varten, TAI None jos käyttäjänimeä ei ole asetettu (Orthanc ilman autentikointia).
def orthanc_auth():
    return (settings.ORTHANC_USERNAME, settings.ORTHANC_PASSWORD) if settings.ORTHANC_USERNAME else None
