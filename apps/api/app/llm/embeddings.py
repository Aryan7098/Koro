"""Multilingual embeddings.

Two backends selectable via ``settings.embedding_backend``:

    - ``cohere``  (default) — Cohere ``embed-multilingual-v3.0``, 1024-d.
      Free-tier friendly (1k calls/month), no local model to load.
    - ``local``   — sentence-transformers ``BAAI/bge-m3``, 1024-d.
      Kept for local dev without an internet dependency; requires
      ``pip install "echostand-api[local-embed]"``.

Both produce 1024-d vectors so the pgvector column doesn't change.

Graceful degradation: when nothing works (no API key + no local model),
:func:`embed` returns zero-vectors and logs a warning. The fusion pipeline
then falls back to node+category-only clustering, still producing
Canonical Events — just less semantic granularity.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from app.core.config import settings

log = logging.getLogger(__name__)


DIM = 1024


# ---------- backend probes -------------------------------------------------


@lru_cache(maxsize=1)
def _cohere_client() -> Any | None:
    if not settings.cohere_api_key:
        return None
    try:
        import cohere  # type: ignore
    except ImportError:
        log.warning("cohere package not installed — pip install cohere")
        return None
    return cohere.Client(settings.cohere_api_key)


@lru_cache(maxsize=1)
def _local_model() -> Any | None:
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except ImportError:
        return None
    log.info("loading local embedding model: %s", settings.embedding_model)
    return SentenceTransformer(settings.embedding_model)


# ---------- public API -----------------------------------------------------


def _zero_vectors(n: int) -> list[list[float]]:
    return [[0.0] * DIM for _ in range(n)]


def embed(texts: list[str]) -> list[list[float]]:
    """Encode a batch of texts to 1024-d vectors."""
    if not texts:
        return []

    backend = (settings.embedding_backend or "cohere").lower()

    if backend == "cohere":
        client = _cohere_client()
        if client is not None:
            try:
                resp = client.embed(
                    texts=[t or " " for t in texts],
                    model="embed-multilingual-v3.0",
                    input_type="clustering",
                )
                vecs = resp.embeddings
                # Cohere returns list[list[float]] already
                return [list(v) for v in vecs]
            except Exception as e:
                log.exception("cohere embed failed, falling back: %s", e)

    # Fallback to local (if installed) — useful for local dev without a key.
    model = _local_model()
    if model is not None:
        try:
            vecs = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
            return [v.tolist() for v in vecs]
        except Exception as e:
            log.exception("local embed failed: %s", e)

    log.warning("no embedding backend available — returning zero-vectors")
    return _zero_vectors(len(texts))


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
