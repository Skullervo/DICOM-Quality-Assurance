"""Tietokantaoperaatiot: QUEUED-jobien luonti job-tauluihin (dedup via UNIQUE).

Insert laukaisee Service Broker -triggerin (doorbell), joka herättää workerin.
Idempotentti: IF NOT EXISTS estää duplikaattijobin samalle orthanc_id:lle.
"""
import logging
import pymssql

from ..config import settings

logger = logging.getLogger(__name__)

# Modaliteettiavain -> job-taulu. Avain on palvelun sisäinen (ei käyttäjäsyötettä).
JOB_TABLES = {"us": "us_jobs", "xray": "xray_jobs", "ct": "ct_jobs", "angio": "angio_jobs"}


def connect():
    # Avaa yhteyden MS SQL Serveriin asetusten (settings.DB) perusteella.
    # Kutsuja vastaa yhteyden sulkemisesta (ks. create_jobs_for_study).
    cfg = settings.DB
    return pymssql.connect(
        server=cfg["server"], port=str(cfg["port"]),
        user=cfg["user"], password=cfg["password"], database=cfg["database"],
    )


def create_job(cur, kind: str, job: dict) -> bool:
    """Luo yksi QUEUED-job jos orthanc_id ei jo ole taulussa. Palauttaa True jos luotiin."""
    # kind on palvelun sisäinen avain (us/xray/ct/angio) -> oikea taulunimi.
    # Taulunimi EI tule käyttäjäsyötteestä, joten f-string tässä on turvallinen.
    table = JOB_TABLES[kind]
    # IF NOT EXISTS + INSERT = idempotentti luonti: jos sama orthanc_id on jo
    # taulussa (esim. Orthanc lähetti webhookin kahdesti), riviä ei lisätä uudelleen.
    # Kaikki arvot sidotaan %s-parametreina (SQL-injektiosuojaus).
    cur.execute(
        f"IF NOT EXISTS (SELECT 1 FROM {table} WHERE orthanc_id=%s) "
        f"INSERT INTO {table} "
        f"(orthanc_id, modality, study_instance_uid, series_instance_uid, sop_instance_uid, station_name) "
        f"VALUES (%s,%s,%s,%s,%s,%s)",
        (
            job["orthanc_id"],
            job["orthanc_id"], job.get("modality", ""),
            job.get("study_instance_uid", ""), job.get("series_instance_uid", ""),
            job.get("sop_instance_uid", ""), job.get("station_name", ""),
        ),
    )
    # rowcount == 1 tarkoittaa että INSERT lisäsi rivin (uusi job luotiin).
    # rowcount == 0 tarkoittaa että IF NOT EXISTS esti insertin (duplikaatti).
    return cur.rowcount == 1


def create_jobs_for_study(enumerated: dict) -> dict:
    """Luo jobit koko study:lle (us/xray/ct). Palauttaa luonti-/duplikaattilukumäärät."""
    study_uid = enumerated.get("study_instance_uid", "")
    # Lasketaan paljonko jobeja luotiin ja montako oli jo olemassa (duplikaatti),
    # jaoteltuna modaliteetin mukaan. Palautetaan kutsujalle logitusta/vastausta varten.
    counts = {"created": 0, "duplicate": 0, "by_modality": {"us": 0, "xray": 0, "ct": 0, "angio": 0}}

    conn = connect()
    try:
        cur = conn.cursor()
        # Käydään modaliteetit läpi ja kullekin löydetyt analysoitavat yksiköt.
        for kind in ("us", "xray", "ct", "angio"):
            for job in enumerated.get(kind, []):
                # Varmistetaan että jokaisella jobilla on study-UID (tiedon ehjyys).
                job.setdefault("study_instance_uid", study_uid)
                if create_job(cur, kind, job):
                    counts["created"] += 1
                    counts["by_modality"][kind] += 1
                else:
                    counts["duplicate"] += 1
        # Yksi commit koko study:lle: joko kaikki uudet jobit tallentuvat tai ei mikään.
        # Commit laukaisee myös Service Broker -triggerit, jotka herättävät workerit.
        conn.commit()
    finally:
        # Yhteys suljetaan aina, myös virhetilanteessa.
        conn.close()
    return counts
