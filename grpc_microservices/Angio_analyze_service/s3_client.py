"""S3-yhteensopiva object storage -client (manuscript §2.2.5).

S3-geneerinen (boto3) — toimii SeaweedFS/MinIO/mitä tahansa S3-endpointtia vastaan.
Path-style addressing pakotettu, koska SeaweedFS/MinIO eivät tue vhost-bucket-DNS:ää.
"""
import os
import logging
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://object-storage:8333")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_BUCKET = os.getenv("S3_BUCKET", "qa-outputs")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

_bucket_ready = False


def _client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def ensure_bucket(client=None):
    global _bucket_ready
    if _bucket_ready:
        return
    c = client or _client()
    try:
        c.head_bucket(Bucket=S3_BUCKET)
    except ClientError:
        try:
            c.create_bucket(Bucket=S3_BUCKET)
            logger.info("Luotiin S3-bucket %s", S3_BUCKET)
        except ClientError as e:
            logger.warning("Bucketin %s luonti epäonnistui (oletetaan olemassa): %s", S3_BUCKET, e)
    _bucket_ready = True


def upload_bytes(key: str, data: bytes, content_type: str = "image/png") -> str:
    """Tallenna tavut S3:een avaimella key. Palauttaa s3://bucket/key."""
    c = _client()
    ensure_bucket(c)
    c.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
    return f"s3://{S3_BUCKET}/{key}"
