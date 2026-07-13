"""Local multilingual embeddings (bge-m3 by default, 1024-d).

Loaded lazily on first use — startup remains fast, and the model only warms
if fusion actually needs to embed something (i.e. once a report arrives).
Runs on CPU by default; GPU is picked up automatically if available.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import settings

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _model():
    # Lazy import — sentence-transformers pulls in torch, don't do it at process start
    from sentence_transformers import SentenceTransformer

    log.info("loading embedding model: %s", settings.embedding_model)
    return SentenceTransformer(settings.embedding_model)


def embed(texts: list[str]) -> list[list[float]]:
    """Encode a batch of texts to 1024-d vectors. Empty strings pass through as zeros."""
    if not texts:
        return []
    model = _model()
    # normalize_embeddings=True makes cosine == dot; convenient for pgvector queries
    vecs = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return [v.tolist() for v in vecs]


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
