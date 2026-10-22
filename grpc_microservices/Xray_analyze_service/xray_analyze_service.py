# =============================================================================
# RÖNTGEN-ANALYYSIPALVELU (X-ray Analyze Service) — gRPC-palvelin portissa 50053
# =============================================================================
# MITÄ TÄMÄ TIEDOSTO TEKEE JA MIKÄ SEN ROOLI ON PUTKESSA:
#
# Tämä on AutoQAD-putken natiiviröntgenin (CR/DX) laadunvalvonta-analyysipalvelu.
# Se on yksi kolmesta "analyze"-mikropalvelusta (US=50052, XR=50053, CT=50054).
# Palvelu toimii kahdella tavalla:
#   1) gRPC-palvelimena (tämä tiedosto): toteuttaa AnalyzeAllDicomData-kutsun,
#      joka käy läpi KAIKKI Orthancin sarjat ja analysoi niistä röntgenkuvat.
#   2) Ajastettuna taustapollaajana (start_analyze_scheduler), joka ajaa saman
#      analyysin automaattisesti kerran tunnissa.
# Huom: event-driven-malli (worker_xr_eventdriven.py) käyttää TÄMÄN tiedoston
# apufunktioita (analyysi + insert), joten tämä moduuli on myös "kirjasto".
#
# ANALYYSIN YDIN: fantomi on NORMI-13, ja analyysin tekee normi13_qa-kirjasto
# (pylinac-pohjainen). Mitatut suureet: PIU-uniformiteetti, Cu-kiila (cu_000...
# cu_230), matalan kontrastin CNR/SNR ja MTF (modulaation siirtofunktio).
#
# PUTKI KOKONAISUUDESSAAN:
#   Sairaalan PACS -> Orthanc -> (tämä palvelu hakee DICOMit) -> normi13_qa-analyysi
#   -> tulokset + analyysikuvat MS SQL Server -tauluun xray_analysis -> Go-backend
#   -> React-käyttöliittymä.
# =============================================================================

import sys
import os
# Lisätään Fetch_service-kansio import-polkuun, koska sieltä tuodaan gRPC-stubit
# (fetch_service_pb2*). Fetch Service (portti 50051) hakee varsinaisen DICOM-datan
# Orthancista; tämä palvelu kutsuu sitä asiakkaana.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Fetch_service')))

import grpc                              # gRPC-runko (palvelin + asiakas)
from concurrent import futures           # säiepooli gRPC-palvelimelle
import xray_analyze_service_pb2          # generoidut viestit (ÄLÄ muokkaa)
import xray_analyze_service_pb2_grpc     # generoidut palvelustubit (ÄLÄ muokkaa)
import fetch_service_pb2                 # Fetch-palvelun viestit (DICOM-haku)
import fetch_service_pb2_grpc            # Fetch-palvelun stubit
import pymssql                           # MS SQL Server -ajuri (tietokanta)
import numpy as np                       # (apukirjasto; käytössä välillisesti)
import io                                # muistipuskurit (DICOM-tavut, PNG-tavut)
import json                              # MTF-/ROI-datan sarjallistus JSON-tekstiksi
import traceback                         # tallennetaan epäonnistumisen pino DB:hen
import glob as globmod                   # tiedostohaku (ei aktiivisessa käytössä tässä)
import tempfile                          # Normi13 vaatii DICOMin levyltä -> väliaikaistiedosto
from pathlib import Path
import pydicom                           # DICOM-tiedoston luku
from pydicom.errors import InvalidDicomError
from time import time as timer           # analyysin keston mittaus
import requests                          # Orthanc REST -kutsut (sarjat, instanssit)
import threading                         # ajastettu taustapollaaja omassa säikeessä
import time
import logging

# Matplotlib pitää asettaa "Agg"-taustajärjestelmään ENNEN pyplot-importtia:
# palvelimella ei ole näyttöä (headless), joten kuvat renderöidään suoraan
# tiedostoksi/muistiin ilman GUI-ikkunaa. Muuten matplotlib yrittää avata ikkunan
# ja kaatuu kontissa.
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

# ── MONKEY-PATCH: pylinac 3.38 -yhteensopivuus ──────────────────────────────
# MIKSI tämä tarvitaan:
#   normi13_qa-kirjasto on kirjoitettu vanhaa pylinac-versiota vastaan ja kutsuu
#   ROI-luokkien konstruktoreita vanhalla allekirjoituksella:
#       (array, angle, roi_radius, dist_from_center, phantom_center, ...)
#   pylinac 3.38 muutti konstruktorin muotoon:
#       (array, radius, center, contrast_threshold)
#   ja siirsi vanhan laskennan from_phantom_center()-luokkametodiin.
#   Jos tätä ei korjata, normi13_qa kaatuu heti ROI-luonnissa.
# KORJAUS:
#   Kääritään alkuperäinen __init__ "compat"-versioon, joka TUNNISTAA vanhan
#   kutsutavan ja muuntaa argumentit uuteen muotoon (laskee keskipisteen
#   kulmasta + etäisyydestä). Tämä on monkey-patch: muokkaamme kirjaston luokkia
#   ajonaikaisesti koskematta kirjaston omaan koodiin.
from pylinac.planar_imaging import (
    HighContrastDiskROI as _OrigHCROI,   # korkean kontrastin ROI (esim. Cu-kiila, viivaparit)
    LowContrastDiskROI as _OrigLCROI,    # matalan kontrastin ROI (näkyvyystestit)
)
from pylinac.core.geometry import Point as _Point


def _patch_roi_class(cls):
    """Luo yhteensopiva __init__ joka tunnistaa vanhan kutsutavan."""
    # Otetaan talteen luokan alkuperäinen __init__, jotta voimme yhä kutsua sitä.
    _orig_init = cls.__init__

    def _compat_init(self, array, *args, **kwargs):
        # Vanha API: (array, angle, roi_radius, dist_from_center, phantom_center, ...)
        # Tunnistus: 4+ positionaalista argumenttia JA 4. argumentti on Point/tuple
        # (= phantom_center). Tämä erottaa vanhan kutsutavan uudesta luotettavasti.
        if len(args) >= 4 and isinstance(args[3], (_Point, tuple)):
            # Puretaan vanhan API:n argumentit nimettyihin muuttujiin.
            angle, roi_radius, dist_from_center, phantom_center = args[:4]
            # Lasketaan ROI:n todellinen keskipiste kulman, etäisyyden ja
            # fantomin keskipisteen avulla — tämä on juuri se laskenta, joka
            # pylinac 3.38:ssa siirtyi from_phantom_center()-metodiin.
            center = cls._get_shifted_center(angle, dist_from_center, phantom_center)
            # Mahdolliset ylimääräiset positionaaliset argumentit (esim.
            # contrast_threshold) siirretään kwargs-muotoon uutta API:a varten.
            remaining_positional = args[4:]
            if remaining_positional and 'contrast_threshold' not in kwargs:
                kwargs['contrast_threshold'] = remaining_positional[0]
            # Kutsutaan alkuperäistä __init__:iä UUDELLA allekirjoituksella.
            _orig_init(self, array=array, radius=roi_radius,
                       center=center, **kwargs)
        else:
            # Kutsu tuli jo uudella API:lla -> välitetään sellaisenaan eteenpäin.
            _orig_init(self, array, *args, **kwargs)

    # Korvataan luokan __init__ yhteensopivalla versiolla (varsinainen patch).
    cls.__init__ = _compat_init


# Sovelletaan patch molempiin ROI-luokkiin ENNEN normi13_qa:n importtia, jotta
# kirjasto saa heti korjatut luokat käyttöönsä.
_patch_roi_class(_OrigHCROI)
_patch_roi_class(_OrigLCROI)

# Vasta nyt tuodaan Normi13 — patchin jälkeen (järjestys on kriittinen).
from normi13_qa.normi13 import Normi13

# ── Kuvien generointi normi13_qa-analyysin jälkeen ──────────────────────────
# Nämä kolme funktiota tuottavat PNG-kuvat (tavuina) suoraan analyysiolion (IQ)
# tiedoista. Kuvat tallennetaan tietokantaan BLOB-kenttiin ja näytetään sivulla.
# Kuvat tehdään ITSE (plot=False annetaan Normi13:lle), jotta tyyli saadaan
# sopimaan käyttöliittymän tummaan teemaan.

def _render_roi_map(IQ):
    """Renderöi tumma ROI-kartta: kaikki ROI-alueet DICOM-kuvan päälle."""
    # Luodaan matplotlib-kuva mustalla taustalla ja piirretään DICOM-kuva harmaana.
    fig, ax = plt.subplots(figsize=(6, 6), facecolor='black')
    ax.imshow(IQ.dcm_img, cmap='gray')
    ax.set_facecolor('black')
    ax.axis('off')  # ei akseleita/asteikkoja — vain kuva + ROI-merkinnät

    # Uniformiteetti-ROI:t (syaani) — alueet joista mitataan tasaisuus/PIU.
    for roi in IQ.uniformity_rois.values():
        roi.plot2axes(ax, edgecolor='#00b4d8')

    # Korkean kontrastin ROI:t (vihreä). 'lps' = viivapari-ROI (line pair set),
    # joka piirretään erikseen omalla funktiollaan -> ohitetaan tässä.
    for name, roi in IQ.high_contrast_rois.items():
        if name == 'lps':
            continue
        roi.plot2axes(ax, edgecolor='#4ade80')

    # Matalan kontrastin ROI:t (keltainen) — näkyvyystestin kohteet.
    for roi in IQ.low_contrast_rois.values():
        roi.plot2axes(ax, edgecolor='#fbbf24')

    # Tallennetaan kuva muistipuskuriin PNG:nä ja palautetaan tavut.
    # bbox_inches='tight' + pad_inches=0 rajaa tyhjät reunat pois.
    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor='black',
                bbox_inches='tight', pad_inches=0, dpi=150)
    plt.close(fig)  # vapauta kuva muistista (muuten muistivuoto pitkässä ajossa)
    buf.seek(0)
    return buf.read()


def _render_mtf_lp_image(IQ):
    """Renderöi viivapari-alueen kuva tummalla taustalla ROI-merkinnöillä."""
    # 'lps' = line pair set -ROI. Jos sitä ei ole (analyysi ei löytänyt), ei kuvaa.
    lps_roi = IQ.high_contrast_rois.get('lps')
    if lps_roi is None:
        return None

    # Rajataan vain viivapari-alue kuvasta (sama logiikka kuin normi13_qa:n
    # sisäisessä _estimate_mtf:ssä). max/min-kutsut varmistavat, ettei rajaus
    # mene kuvan reunojen ulkopuolelle (indeksivirheiden esto).
    x1 = max(0, int(lps_roi.center.x - lps_roi.diameter))
    x2 = min(IQ.dcm_img.shape[1], int(lps_roi.center.x + lps_roi.diameter))
    y1 = max(0, int(lps_roi.center.y - lps_roi.diameter))
    y2 = min(IQ.dcm_img.shape[0], int(lps_roi.center.y + lps_roi.diameter))
    lps_cropped = IQ.dcm_img[y1:y2, x1:x2]

    fig, ax = plt.subplots(figsize=(5, 5), facecolor='black')
    ax.imshow(lps_cropped, cmap='gray')
    ax.set_facecolor('black')
    ax.axis('off')

    # Piirretään yksittäiset viivapari-ROI:t ympyröinä. Koordinaatit ovat koko
    # kuvan avaruudessa, joten vähennetään rajauksen vasen/ylä-kulma (x1,y1),
    # jotta ympyrät osuvat rajatussa kuvassa oikeaan kohtaan.
    for roi in IQ.line_pair_rois.values():
        cx = roi.center.x - x1
        cy = roi.center.y - y1
        circle = Circle((cx, cy), roi.radius,
                         fill=False, edgecolor='#38bdf8', linewidth=1.5)
        ax.add_patch(circle)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor='black',
                bbox_inches='tight', pad_inches=0, dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _render_mtf_curve(IQ):
    """Renderöi MTF-käyrä sivun dark-teemaan sopivalla tyylillä."""
    # MTF (Modulation Transfer Function) kuvaa terävyyttä/erotuskykyä. Jos olio
    # ei sisällä MTF-tulosta (analyysi ei saanut sitä), ei piirretä mitään.
    if not hasattr(IQ, 'mtf') or IQ.mtf is None:
        return None

    # Käyttöliittymän tumman teeman värit (tausta, ruudukko, teksti, viiva).
    BG = '#0d1117'
    GRID = '#1e293b'
    TEXT = '#94a3b8'
    LINE = '#00b4d8'

    fig, ax = plt.subplots(figsize=(6, 3.5), facecolor=BG)
    ax.set_facecolor(BG)

    # pylinacin MTF-olio osaa piirtää käyrän itse annettuun akseliin.
    IQ.mtf.plot(ax)

    # Vaihdetaan piirretyn käyrän väri teemaan sopivaksi (pylinac käyttää omia).
    for line in ax.get_lines():
        line.set_color(LINE)
        line.set_linewidth(2)

    # Tummennetaan akselin viivat ja tekstit, jotta ne näkyvät tummalla taustalla.
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.tick_params(colors=TEXT, labelsize=8)
    ax.xaxis.label.set_color(TEXT)
    ax.yaxis.label.set_color(TEXT)
    if ax.get_title():
        ax.set_title(ax.get_title(), color=TEXT, fontsize=10)
    ax.grid(True, color=GRID, alpha=0.5, linewidth=0.5)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor=BG,
                bbox_inches='tight', pad_inches=0.3, dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# Lataa ympäristömuuttujat Djangon .env-tiedostosta (paikallinen ajo). Kontissa
# muuttujat tulevat suoraan ympäristöstä, joten .env puuttuu -> ohitetaan.
# ImportError nielaistaan, jos python-dotenv ei ole asennettu.
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), '..', '..', 'client', '.env')
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        logging.getLogger(__name__).info("Loaded .env from %s", _env_path)
except ImportError:
    pass

# Orthanc ja Fetch Service -osoitteet (luetaan ympäristömuuttujista, oletukset
# sopivat paikalliseen ajoon). Orthanc = DICOM-palvelin josta kuvat haetaan.
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USER = os.getenv("ORTHANC_USERNAME", "admin")
ORTHANC_PASS = os.getenv("ORTHANC_PASSWORD", "")
FETCH_SERVICE_ADDRESS = os.getenv("FETCH_SERVICE_HOST", "localhost:50051")

# Natiiviröntgenin modaliteetit (CR = Computed Radiography, DX = Digital X-ray).
# Palvelu itse-suodattaa: se analysoi vain nämä DICOM-modaliteetit ja ohittaa muut.
XRAY_MODALITIES = ("CR", "DX")

# MS SQL Server (pymssql). Skeema luodaan scripts/schema_mssql.sql:ssä.
DB_CONFIG = {
    "database": os.getenv("DATABASE_NAME", "QA-results"),
    "user": os.getenv("DATABASE_USER", "sa"),
    "password": os.getenv("DATABASE_PASSWORD", ""),
    "server": os.getenv("DATABASE_HOST", "autoqad-mssql"),
    "port": os.getenv("DATABASE_PORT", "1433"),
}

logger = logging.getLogger(__name__)


def connect_db():
    """Luo tietokantayhteys ja varmista, että xray_analysis-taulu on olemassa."""
    return pymssql.connect(**DB_CONFIG)


def _ensure_failures_table(cur):
    # Varmistaa, että epäonnistumisloki-taulu (analysis_failures) on olemassa.
    # Luodaan tarvittaessa lennossa (IF ... IS NULL), jotta palvelu toimii myös
    # ilman erillistä migraatiota. Toinen lause lisää 'detail'-sarakkeen, jos se
    # puuttuu vanhasta taulusta (traceback-kentän jälkikäteislisäys).
    cur.execute("""
        IF OBJECT_ID('dbo.analysis_failures','U') IS NULL
        CREATE TABLE dbo.analysis_failures (
            modality NVARCHAR(8) NOT NULL,
            orthanc_id NVARCHAR(128) NOT NULL,
            station_name NVARCHAR(256) NULL,
            reason NVARCHAR(1000) NULL,
            detail NVARCHAR(MAX) NULL,
            failed_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            CONSTRAINT pk_analysis_failures PRIMARY KEY (modality, orthanc_id)
        )
    """)
    cur.execute("""
        IF COL_LENGTH('dbo.analysis_failures','detail') IS NULL
            ALTER TABLE dbo.analysis_failures ADD detail NVARCHAR(MAX) NULL
    """)


def record_failure(cur, orthanc_id, station, reason, detail=""):
    """Tallenna epäonnistuneen analyysin syy + traceback (upsert). orthanc_id = XR:llä series_id."""
    # "Upsert" ilman MERGE-lausetta: poistetaan vanha rivi ja lisätään uusi, jotta
    # saman sarjan uusin epäonnistuminen korvaa vanhan. Arvot katkaistaan
    # sarakkeiden maksimipituuksiin ([:256] jne.), jotta INSERT ei kaadu.
    try:
        _ensure_failures_table(cur)
        cur.execute("DELETE FROM analysis_failures WHERE modality=%s AND orthanc_id=%s", ("XR", orthanc_id))
        cur.execute(
            "INSERT INTO analysis_failures (modality, orthanc_id, station_name, reason, detail) VALUES (%s, %s, %s, %s, %s)",
            ("XR", orthanc_id, (station or "")[:256], (reason or "")[:1000], (detail or "")[:8000]))
    except Exception as e:  # noqa: BLE001
        logger.error("record_failure error: %s", e)


def clear_failure(cur, orthanc_id):
    """Poista mahdollinen epäonnistumismerkintä (sarja onnistui myöhemmin)."""
    try:
        cur.execute("DELETE FROM analysis_failures WHERE modality=%s AND orthanc_id=%s", ("XR", orthanc_id))
    except Exception as e:  # noqa: BLE001
        logger.error("clear_failure error: %s", e)


def get_fetch_stub():
    """Yhdistetään Fetch Serviceen."""
    # Kasvatetaan gRPC-viestin maksimikokoa (200 MB), koska DICOM-kuvat voivat
    # olla suuria. Oletusraja (4 MB) kaataisi suurten kuvien haun.
    options = [
        ("grpc.max_send_message_length", 200 * 1024 * 1024),
        ("grpc.max_receive_message_length", 200 * 1024 * 1024),
    ]
    channel = grpc.insecure_channel(FETCH_SERVICE_ADDRESS, options=options)
    return fetch_service_pb2_grpc.FetchServiceStub(channel)


def extract_dicom_metadata(ds):
    """Poimi DICOM-metatiedot datasetistä."""
    # Apufunktio: lukee yhden DICOM-tagin merkkijonona. Jos tagi puuttuu tai on
    # tyhjä, palautetaan oletusarvo. Näin INSERT saa aina kelvollisen arvon.
    def get_tag(tag_name, default=""):
        val = ds.get(tag_name, default)
        return str(val) if val else default

    return {
        "content_date": get_tag("ContentDate") or get_tag("AcquisitionDate"),
        "content_time": get_tag("ContentTime"),
        "device_serial_number": get_tag("DeviceSerialNumber"),
        "instance_number": get_tag("InstanceNumber"),
        "institution_name": get_tag("InstitutionName", "Unknown"),
        "institutional_department_name": get_tag("InstitutionalDepartmentName", "Unknown"),
        "manufacturer": get_tag("Manufacturer", "Unknown"),
        "manufacturer_model_name": get_tag("ManufacturerModelName"),
        "modality": get_tag("Modality", "Unknown"),
        "patient_id": get_tag("PatientID"),
        "patient_name": get_tag("PatientName"),
        "station_name": get_tag("StationName", "Unknown"),
        "series_date": get_tag("SeriesDate"),
        "study_date": get_tag("StudyDate"),
        "kvp": get_tag("KVP"),
        "exposure_time": get_tag("ExposureTime"),
        "tube_current": get_tag("XRayTubeCurrent"),
        "filter_type": get_tag("FilterType"),
        "grid_info": get_tag("Grid"),
        "distance_source_to_detector": get_tag("DistanceSourceToDetector"),
        "focal_spot": get_tag("FocalSpots"),
        "protocol_name": get_tag("ProtocolName"),
        "exposure_mAs": get_tag("Exposure"),
    }


def extract_analysis_results(results, IQ=None):
    """Mapaa normi13_qa:n analyysitulokset tietokantakenttiin.

    results = IQ.results_data(as_dict=True) palauttaa PlanarResult-dictionaryn.
    IQ = Normi13-olio, josta saadaan Cu std -arvot ja muut attribuutit.
    """
    def safe_float(val, default=None):
        if val is None:
            return default
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    # Poimi perusmetriikat
    data = {
        "median_contrast": safe_float(results.get("median_contrast")),
        "median_cnr": safe_float(results.get("median_cnr")),
        "num_contrast_rois_seen": results.get("num_contrast_rois_seen"),
        "phantom_area": safe_float(results.get("phantom_area")),
        "analysis_type": results.get("analysis_type", "Normi13"),
    }

    # Phantom-keskipiste (tuple tai lista)
    center = results.get("phantom_center_x_y")
    if center and len(center) >= 2:
        data["phantom_center_x"] = safe_float(center[0])
        data["phantom_center_y"] = safe_float(center[1])

    # MTF-data: pylinac antaa sanakirjan, jossa avaimet ovat prosenttitasoja
    # merkkijonoina (esim. "50" = MTF 50 %:n kohta viivaparia/mm). Koko sanakirja
    # tallennetaan JSON-tekstinä, ja 50 %:n arvo poimitaan omaan kenttään.
    # mtf.get("50") or mtf.get(50): avain voi olla joko str tai int -> kokeillaan molemmat.
    mtf = results.get("mtf_lp_mm")
    if mtf:
        data["mtf_data"] = json.dumps(mtf)
        data["mtf_50_percent"] = safe_float(mtf.get("50") or mtf.get(50))

    # Matalan kontrastin ROI:t. Lista järjestyksessä; indeksi kertoo kohteen koon
    # (lc_08 = 0.8 mm ... lc_56 = 5.6 mm). Mapataan indeksit DB-kenttiin + kerätään
    # yksityiskohdat (contrast/cnr/snr/visibility/passed) JSON-listaksi.
    lc_rois = results.get("low_contrast_rois", [])
    lc_contrasts = {}
    lc_field_map = {
        0: "lc_08_contrast",
        1: "lc_12_contrast",
        2: "lc_20_contrast",
        3: "lc_28_contrast",
        4: "lc_40_contrast",
        5: "lc_56_contrast",
    }
    lc_name_map = {
        0: "lc_08",
        1: "lc_12",
        2: "lc_20",
        3: "lc_28",
        4: "lc_40",
        5: "lc_56",
    }
    lc_details = []
    for idx, roi in enumerate(lc_rois):
        if idx in lc_field_map and isinstance(roi, dict):
            lc_contrasts[lc_field_map[idx]] = safe_float(roi.get("contrast"))
            lc_details.append({
                "name": lc_name_map.get(idx, f"lc_{idx}"),
                "contrast": safe_float(roi.get("contrast")),
                "cnr": safe_float(roi.get("cnr")),
                "snr": safe_float(roi.get("signal to noise")),
                "visibility": safe_float(roi.get("visibility")),
                "passed": roi.get("passed visibility", False),
            })
    data.update(lc_contrasts)
    if lc_details:
        data["low_contrast_details"] = json.dumps(lc_details)

    # IQ-oliosta poimitaan suureita, joita results_data ei suoraan anna:
    # uniformiteetti (PIU) sekä Cu-kiilan ROI:iden keskiarvot ja keskihajonnat.
    if IQ is not None:
        # Uniformiteetti: lasketaan PIU (Percent Integral Uniformity).
        # PIU kuvaa kuvan tasaisuutta: 100 % = täysin tasainen.
        u_rois = getattr(IQ, "uniformity_rois", None)
        if u_rois and isinstance(u_rois, dict):
            # Kerätään jokaisen uniformiteetti-ROI:n keskiarvo (vain validit arvot).
            u_means = [safe_float(getattr(r, "mean", None))
                       for r in u_rois.values()
                       if getattr(r, "mean", None) is not None]
            if u_means:
                u_max = max(u_means)
                u_min = min(u_means)
                # PIU-kaava: 100*(1-(max-min)/(max+min)). Jakajan >0-tarkistus
                # estää nollajaon (esim. jos kaikki arvot olisivat nollia).
                if u_max + u_min > 0:
                    piu = 100.0 * (1.0 - (u_max - u_min) / (u_max + u_min))
                    data["uniformity_center"] = round(piu, 2)
                    data["uniformity_deviation"] = round(u_max - u_min, 2)
                # Keskimmäisen ROI:n mean → bg_mean
                center_roi = u_rois.get("u_center")
                if center_roi is not None:
                    data["bg_mean"] = safe_float(getattr(center_roi, "mean", None))

        # Cu-kiilan (kupariporras) ROI:iden mean + std. Nimet cu_000...cu_230
        # vastaavat kiilan eri paksuuksia; näistä muodostuu kontrastiporras.
        hc_rois = getattr(IQ, "high_contrast_rois", None)
        if hc_rois and isinstance(hc_rois, dict):
            for cu_name in ["cu_000", "cu_030", "cu_065", "cu_100",
                            "cu_140", "cu_185", "cu_230"]:
                roi = hc_rois.get(cu_name)
                if roi is not None:
                    mean_val = getattr(roi, "mean", None)
                    std_val = getattr(roi, "std", None)
                    data[f"{cu_name}_mean"] = safe_float(mean_val)
                    data[f"{cu_name}_std"] = safe_float(std_val)

    return data


def insert_xray_analysis(cur, instance_id, series_id, metadata, analysis,
                         processing_time, contrast_rois_bytes=None,
                         mtf_lp_bytes=None, mtf_curve_bytes=None):
    """Tallenna analyysitulokset xray_analysis-tauluun."""
    # Yksi iso INSERT: sarakkeiden järjestyksen on vastattava alla olevaa
    # arvolistaa (%s-paikat). Jokaista %s kohden on tarkalleen yksi arvo samassa
    # järjestyksessä. Kolme viimeistä (contrast_rois_image, mtf_lp_image,
    # mtf_curve_image) ovat PNG-tavuja (BLOB), loput metatietoja/metriikoita.
    cur.execute("""
        INSERT INTO xray_analysis (
            instance, series_id, content_date, content_time, device_serial_number,
            instance_number, institution_name, institutional_department_name,
            manufacturer, manufacturer_model_name, modality, patient_id, patient_name,
            station_name, series_date, study_date,
            kvp, exposure_time, tube_current, filter_type, grid_info,
            distance_source_to_detector, focal_spot, protocol_name, exposure_mas,
            uniformity_center, uniformity_deviation, bg_mean,
            cu_000_mean, cu_030_mean, cu_065_mean, cu_100_mean,
            cu_140_mean, cu_185_mean, cu_230_mean,
            cu_000_std, cu_030_std, cu_065_std, cu_100_std,
            cu_140_std, cu_185_std, cu_230_std,
            lc_08_contrast, lc_12_contrast, lc_20_contrast,
            lc_28_contrast, lc_40_contrast, lc_56_contrast,
            low_contrast_details,
            median_contrast, median_cnr, mtf_50_percent, num_contrast_rois_seen,
            phantom_angle, phantom_center_x, phantom_center_y,
            phantom_area, side_length, mtf_data,
            analysis_type, analysis_version, processing_time,
            contrast_rois_image, mtf_lp_image, mtf_curve_image
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s
        )
    """, (
        instance_id, series_id,
        metadata["content_date"], metadata["content_time"],
        metadata["device_serial_number"], metadata["instance_number"],
        metadata["institution_name"], metadata["institutional_department_name"],
        metadata["manufacturer"], metadata["manufacturer_model_name"],
        metadata["modality"], metadata["patient_id"], metadata["patient_name"],
        metadata["station_name"], metadata["series_date"], metadata["study_date"],
        metadata["kvp"], metadata["exposure_time"], metadata["tube_current"],
        metadata["filter_type"], metadata["grid_info"],
        metadata["distance_source_to_detector"], metadata["focal_spot"],
        metadata["protocol_name"], metadata["exposure_mAs"],
        analysis.get("uniformity_center"),
        analysis.get("uniformity_deviation"),
        analysis.get("bg_mean"),
        analysis.get("cu_000_mean"), analysis.get("cu_030_mean"),
        analysis.get("cu_065_mean"), analysis.get("cu_100_mean"),
        analysis.get("cu_140_mean"), analysis.get("cu_185_mean"),
        analysis.get("cu_230_mean"),
        analysis.get("cu_000_std"), analysis.get("cu_030_std"),
        analysis.get("cu_065_std"), analysis.get("cu_100_std"),
        analysis.get("cu_140_std"), analysis.get("cu_185_std"),
        analysis.get("cu_230_std"),
        analysis.get("lc_08_contrast"), analysis.get("lc_12_contrast"),
        analysis.get("lc_20_contrast"), analysis.get("lc_28_contrast"),
        analysis.get("lc_40_contrast"), analysis.get("lc_56_contrast"),
        analysis.get("low_contrast_details"),
        analysis.get("median_contrast"), analysis.get("median_cnr"),
        analysis.get("mtf_50_percent"), analysis.get("num_contrast_rois_seen"),
        analysis.get("phantom_angle"),
        analysis.get("phantom_center_x"), analysis.get("phantom_center_y"),
        analysis.get("phantom_area"), analysis.get("side_length"),
        analysis.get("mtf_data"),
        analysis.get("analysis_type", "Normi13"),
        analysis.get("analysis_version", "0.1"),
        processing_time,
        contrast_rois_bytes,
        mtf_lp_bytes,
        mtf_curve_bytes,
    ))


# =============================================================================
# gRPC-PALVELULUOKKA: toteuttaa .proto:ssa määritellyt kutsut.
# .proto määrittelee kaksi kutsua, mutta XR:ssä vain AnalyzeAllDicomData on
# toteutettu (yhden sarjan analyysi on tyngäksi jätetty, ks. alempana).
# =============================================================================
class XrayAnalyzeService(xray_analyze_service_pb2_grpc.XrayAnalyzeServiceServicer):
    def AnalyzeAllDicomData(self, request, context):
        # Käy läpi KAIKKI Orthancin sarjat ja analysoi niistä löytyvät
        # röntgenkuvat (CR/DX). Palauttaa yhteenvedon analysoitujen määrästä.
        logger.info("Received request to analyze all X-ray series in Orthanc")

        # Haetaan kaikki sarjat Orthancista REST-rajapinnalla. auth annetaan vain,
        # jos salasana on asetettu (paikallisessa ajossa voi olla ilman).
        auth = (ORTHANC_USER, ORTHANC_PASS) if ORTHANC_PASS else None
        response = requests.get(f"{ORTHANC_URL}/series", auth=auth)
        if response.status_code != 200:
            logger.error("Error: Could not fetch series from Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return xray_analyze_service_pb2.AnalyzeResponse(
                message="No series found", series_id="ALL"
            )

        series_list = response.json()
        if not series_list:
            logger.warning("No series found in Orthanc")
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return xray_analyze_service_pb2.AnalyzeResponse(
                message="No series available", series_id="ALL"
            )

        # Avataan yhteys Fetch-palveluun (DICOM-haku) ja tietokantaan kerran,
        # ja käytetään samaa yhteyttä koko ajon ajan.
        fetch_stub = get_fetch_stub()
        conn = connect_db()
        cur = conn.cursor()
        analyzed_count = 0

        # Käydään jokainen sarja läpi; sarja voi sisältää useita instansseja (kuvia).
        for series_id in series_list:
            logger.info("Processing series ID: %s", series_id)

            # Haetaan sarjan instanssilista Orthancista.
            instance_response = requests.get(f"{ORTHANC_URL}/series/{series_id}/instances", auth=auth)
            if instance_response.status_code != 200:
                logger.error("Could not fetch instances for series %s", series_id)
                continue

            instance_list = instance_response.json()
            if not instance_list:
                logger.warning("No instances found for series %s", series_id)
                continue

            for instance in instance_list:
                instance_id = instance["ID"]
                logger.info("Fetching instance ID: %s", instance_id)

                # Haetaan yksittäisen instanssin DICOM-data Fetch-palvelulta (gRPC).
                try:
                    fetch_response = fetch_stub.FetchDicomData(
                        fetch_service_pb2.FetchRequest(instance_id=instance_id)
                    )
                except grpc.RpcError as e:
                    # Fetch-palvelun virhe ei saa kaataa koko ajoa -> ohitetaan tämä.
                    logger.error("gRPC error fetching instance %s: %s", instance_id, e)
                    continue

                if not fetch_response.dicom_data:
                    logger.warning("No data received for instance %s", instance_id)
                    continue

                # Luetaan binääridata pydicom-datasetiksi. force=True sallii myös
                # puutteellisen headerin DICOMit (ei kaadu heti).
                dicom_bytes = fetch_response.dicom_data
                try:
                    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), force=True)
                    logger.info("DICOM data successfully read!")
                except InvalidDicomError as e:
                    logger.error("Error reading DICOM file: %s", e)
                    continue

                # ITSE-SUODATUS: analysoidaan vain röntgenkuvat (CR/DX). Palvelu
                # näkee kaikki Orthancin sarjat (myös US/CT), joten muut ohitetaan.
                modality = str(ds.get("Modality", ""))
                if modality not in XRAY_MODALITIES:
                    logger.info("Not an X-ray image (modality=%s). Skipping instance %s",
                                modality, instance_id)
                    continue

                # Normi13 lukee DICOMin TIEDOSTOPOLUSTA, ei muistipuskurista, joten
                # kirjoitetaan data väliaikaistiedostoon. Tiedosto poistetaan
                # finally-lohkossa riippumatta siitä, onnistuiko analyysi.
                tmp_path = None
                contrast_rois_bytes = None
                mtf_lp_bytes = None
                mtf_curve_bytes = None
                try:
                    with tempfile.NamedTemporaryFile(suffix='.dcm', delete=False) as tmp:
                        tmp.write(dicom_bytes)
                        tmp_path = tmp.name

                    # VARSINAINEN NORMI-13-ANALYYSI normi13_qa-kirjastolla.
                    # plot=False: emme anna kirjaston piirtää kuvia, vaan teemme ne
                    # itse (_render_*). mtf_mode='relative': MTF suhteellisena.
                    # visibility_threshold: matalan kontrastin näkyvyyskynnys.
                    start_time = timer()
                    IQ = Normi13(tmp_path, plot=False, debug=False,
                                 mtf_mode='relative')
                    IQ.analyze(visibility_threshold=0.0025)
                    results = IQ.results_data(as_dict=True)
                    processing_time = timer() - start_time

                    # Generoidaan kolme analyysikuvaa IQ-oliosta. Jokainen
                    # kääritään omaan try-lohkoonsa: yhden kuvan epäonnistuminen
                    # ei estä muiden kuvien tai tulosten tallennusta (best-effort).
                    try:
                        contrast_rois_bytes = _render_roi_map(IQ)
                    except Exception as e:
                        logger.warning("ROI map generation failed: %s", e)
                    try:
                        mtf_lp_bytes = _render_mtf_lp_image(IQ)
                    except Exception as e:
                        logger.warning("MTF LP image generation failed: %s", e)
                    try:
                        mtf_curve_bytes = _render_mtf_curve(IQ)
                    except Exception as e:
                        logger.warning("MTF curve generation failed: %s", e)

                    logger.info("Analysis complete for instance %s (%.1f s, rois=%s, lp=%s, mtf=%s)",
                                instance_id, processing_time,
                                "yes" if contrast_rois_bytes else "no",
                                "yes" if mtf_lp_bytes else "no",
                                "yes" if mtf_curve_bytes else "no")

                except Exception as e:
                    # Analyysi kaatui: kirjataan syy + traceback epäonnistumistauluun
                    # (näkyy ylläpidolle), commitoidaan ja jatketaan seuraavaan.
                    logger.error("Analysis failed for instance %s: %s", instance_id, e)
                    record_failure(cur, series_id, str(ds.get("StationName", "")), str(e), traceback.format_exc())
                    conn.commit()
                    continue
                finally:
                    # Siivotaan väliaikaistiedosto aina (myös onnistuessa).
                    if tmp_path and os.path.exists(tmp_path):
                        os.unlink(tmp_path)

                # Poimitaan DICOM-metatiedot (laite, laitos, kuvausparametrit).
                metadata = extract_dicom_metadata(ds)

                # Mapataan analyysitulokset DB-kenttiin. IQ-olio annetaan mukaan,
                # koska siitä poimitaan Cu-kiilan std-arvot ja PIU (ks. funktio).
                analysis = extract_analysis_results(results, IQ)

                # Duplikaattitarkistus ennen tallennusta: jos sama instanssi on jo
                # tietokannassa, ohitetaan. MSSQL:ssä ei voi tehdä UNIQUE-rajoitetta
                # NVARCHAR(MAX)-sarakkeelle, joten tarkistus tehdään käsin SELECTillä.
                cur.execute("SELECT 1 FROM xray_analysis WHERE instance = %s", (instance_id,))
                if cur.fetchone():
                    logger.info("Instance %s already in database, skipping.", instance_id)
                    continue
                insert_xray_analysis(
                    cur, instance_id, series_id, metadata, analysis,
                    processing_time, contrast_rois_bytes, mtf_lp_bytes, mtf_curve_bytes
                )
                clear_failure(cur, series_id)  # sarja onnistui -> poista mahdollinen epäonnistumismerkintä
                analyzed_count += 1

        # Yksi commit koko ajon lopuksi + yhteyksien sulku.
        conn.commit()
        cur.close()
        conn.close()

        msg = f"X-ray analysis complete! {analyzed_count} instances analyzed."
        logger.info(msg)
        return xray_analyze_service_pb2.AnalyzeResponse(message=msg, series_id="ALL")

    def AnalyzeDicomData(self, request, context):
        # Yhden sarjan analyysiä EI ole toteutettu XR-palvelussa (toisin kuin
        # CT:ssä). .proto vaatii metodin olemassaolon, joten palautetaan tynkä.
        logger.info("Single series analysis not yet implemented for X-ray")
        return xray_analyze_service_pb2.AnalyzeResponse(
            message="Not implemented", series_id=request.series_id
        )


def start_analyze_scheduler(interval_seconds=3600):
    """Käynnistä taustapollaaja joka ajaa XR-analyysin säännöllisesti."""
    service = XrayAnalyzeService()

    # gRPC-kutsut tarvitsevat context-olion. Ajastetussa ajossa ei ole oikeaa
    # gRPC-kontekstia, joten annetaan valekonteksti, jonka set_code ei tee mitään.
    class DummyContext:
        def set_code(self, code):
            pass

    def loop():
        logger.info("XR scheduler started (interval: %ss). Odotetaan ensimmäinen ajo...", interval_seconds)
        time.sleep(30)  # Odota Orthancin ja Fetchin käynnistyvän ennen 1. ajoa
        while True:
            try:
                logger.info("Scheduled X-ray analysis starting...")
                service.AnalyzeAllDicomData(None, DummyContext())
            except Exception as e:
                # Yksittäinen epäonnistunut ajo ei saa tappaa pollaussäiettä.
                logger.error("Scheduled X-ray analysis failed: %s", e)
            logger.info("Odotetaan %s sekuntia seuraavaan ajoon...", interval_seconds)
            time.sleep(interval_seconds)

    # daemon=True: säie ei estä prosessin sulkeutumista.
    t = threading.Thread(target=loop, daemon=True)
    t.start()


def serve():
    # Käynnistää gRPC-palvelimen portissa 50053 ja jää odottamaan kutsuja.
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    xray_analyze_service_pb2_grpc.add_XrayAnalyzeServiceServicer_to_server(
        XrayAnalyzeService(), server
    )
    server.add_insecure_port("[::]:50053")
    server.start()
    logger.info("X-ray Analyze Service running on port 50053")
    server.wait_for_termination()


if __name__ == "__main__":
    # Ohjelman käynnistys: 1) lokitus päälle, 2) ajastettu pollaaja taustalle
    # (kerran tunnissa), 3) gRPC-palvelin kuuntelemaan (serve jää blokkaamaan).
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    start_analyze_scheduler(3600)  # Ajastettu analyysi kerran tunnissa
    serve()
