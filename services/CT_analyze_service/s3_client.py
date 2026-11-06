"""S3-yhteensopiva object storage -client (manuscript §2.2.5).

S3-geneerinen (boto3) — toimii SeaweedFS/MinIO/mitä tahansa S3-endpointtia vastaan.
Path-style addressing pakotettu, koska SeaweedFS/MinIO eivät tue vhost-bucket-DNS:ää.
"""
import os
import logging
import boto3                              # AWS/S3-asiakaskirjasto (toimii myös SeaweedFS:lle)
from botocore.client import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# S3-asetukset ympäristömuuttujista. Oletus-endpoint osoittaa SeaweedFS:ään
# (object-storage:8333). Bucket = "säiliö" johon objektit tallennetaan.
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://object-storage:8333")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_BUCKET = os.getenv("S3_BUCKET", "qa-outputs")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

# Muistetaan onko bucketin olemassaolo jo varmistettu -> ei tarkisteta joka kerta.
_bucket_ready = False


def _client():
    # Luo boto3-S3-asiakkaan. signature_version="s3v4" = moderni allekirjoitus.
    # addressing_style="path" PAKOTTAA path-style-osoitteen (endpoint/bucket/key)
    # vhost-tyylin (bucket.endpoint) sijaan, koska SeaweedFS/MinIO eivät tue
    # bucket-nimeä DNS-alinimessä. Ilman tätä yhteys epäonnistuisi.
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def ensure_bucket(client=None):
    # Varmistaa, että kohde-bucket on olemassa (luo tarvittaessa). Ajetaan vain
    # kerran prosessin elinaikana (_bucket_ready-lippu).
    global _bucket_ready
    if _bucket_ready:
        return
    c = client or _client()
    try:
        # head_bucket onnistuu jos bucket on jo olemassa.
        c.head_bucket(Bucket=S3_BUCKET)
    except ClientError:
        # Bucketia ei ollut -> yritetään luoda. Luonti voi epäonnistua "kilpailu-
        # tilanteessa" (toinen worker ehti luoda) -> se ei ole virhe, vain varoitus.
        try:
            c.create_bucket(Bucket=S3_BUCKET)
            logger.info("Luotiin S3-bucket %s", S3_BUCKET)
        except ClientError as e:
            logger.warning("Bucketin %s luonti epäonnistui (oletetaan olemassa): %s", S3_BUCKET, e)
    _bucket_ready = True


def upload_bytes(key: str, data: bytes, content_type: str = "image/png") -> str:
    """Tallenna tavut S3:een avaimella key. Palauttaa s3://bucket/key."""
    # Varmistetaan bucket, kirjoitetaan objekti ja palautetaan s3://-osoite,
    # jonka voi tallentaa tietokantaan viitteeksi kuvaan.
    c = _client()
    ensure_bucket(c)
    c.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
    return f"s3://{S3_BUCKET}/{key}"
