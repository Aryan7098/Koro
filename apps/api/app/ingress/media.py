"""Media upload (photos / voice notes) → MinIO.

Client uploads binary; we return a ``media_id`` that other endpoints reference.
No transcription or captioning here — that happens in the fusion normalize step
where the LLM is available.
"""
from __future__ import annotations

import io
import uuid
from functools import lru_cache

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from minio import Minio
from minio.error import S3Error

from app.core.config import settings

router = APIRouter(prefix="/media", tags=["ingress:media"])


ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "audio/mpeg",
    "audio/mp4",
    "audio/webm",
    "audio/wav",
    "audio/ogg",
}
MAX_BYTES = 8 * 1024 * 1024  # 8 MiB


@lru_cache
def _client() -> Minio:
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
    return client


@router.post("")
async def upload_media(file: UploadFile = File(...)) -> dict:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"unsupported content-type: {file.content_type}",
        )
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file > 8 MiB")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    media_id = uuid.uuid4().hex
    object_name = f"{media_id}.{ext}" if ext else media_id

    try:
        _client().put_object(
            settings.minio_bucket,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type=file.content_type,
        )
    except S3Error as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"minio: {e}") from e

    return {
        "media_id": object_name,
        "content_type": file.content_type,
        "size": len(data),
    }
