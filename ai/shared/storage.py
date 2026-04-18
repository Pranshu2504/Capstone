"""
S3 / MinIO file storage helpers.
Uses boto3 with an optional custom endpoint_url for local MinIO.
"""
from __future__ import annotations

import os
from pathlib import Path

import boto3
from botocore.config import Config


def _client():
    endpoint = os.getenv("S3_ENDPOINT_URL") or None  # None = real AWS
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


BUCKET = os.getenv("S3_BUCKET", "zora-assets")


def upload_file(local_path: str | Path, s3_key: str) -> str:
    """Upload a local file to S3/MinIO. Returns the s3_key."""
    _client().upload_file(str(local_path), BUCKET, s3_key)
    return s3_key


def download_file(s3_key: str, local_path: str | Path) -> Path:
    """Download an S3 object to a local path. Returns the local Path."""
    p = Path(local_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    _client().download_file(BUCKET, s3_key, str(p))
    return p


def presigned_url(s3_key: str, expires_in: int = 30 * 24 * 3600) -> str:
    """Generate a pre-signed GET URL (default 30-day expiry)."""
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": s3_key},
        ExpiresIn=expires_in,
    )


def delete_prefix(prefix: str) -> int:
    """Delete all objects under a given S3 prefix. Returns count deleted."""
    s3 = _client()
    paginator = s3.get_paginator("list_objects_v2")
    deleted = 0
    for page in paginator.paginate(Bucket=BUCKET, Prefix=prefix):
        objects = [{"Key": o["Key"]} for o in page.get("Contents", [])]
        if objects:
            s3.delete_objects(Bucket=BUCKET, Delete={"Objects": objects})
            deleted += len(objects)
    return deleted
