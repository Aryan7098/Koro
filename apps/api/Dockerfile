# Koro API — production Docker image.
# Build context: the repo root (echostand/). Build with:
#     docker build -f apps/api/Dockerfile -t echostand-api .
# Fly.io does this automatically via fly.toml.
#
# Slim image (~500 MB) — no torch, no local embedding model. Embeddings
# come from Cohere (EMBEDDING_BACKEND=cohere, set COHERE_API_KEY).

FROM python:3.12-slim AS build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the pyproject first so pip install caches when deps don't change
COPY apps/api/pyproject.toml ./
RUN pip install --upgrade pip \
    && pip install \
        "fastapi>=0.115" "uvicorn[standard]>=0.32" "pydantic>=2.9" \
        "pydantic-settings>=2.6" "sqlalchemy[asyncio]>=2.0.35" \
        "asyncpg>=0.30" "psycopg2-binary>=2.9" "alembic>=1.13" \
        "pgvector>=0.3" "redis>=5.2" "arq>=0.26" "anthropic>=0.40" \
        "cohere>=5.11" "google-genai>=0.8" "python-jose[cryptography]>=3.3" \
        "passlib[bcrypt]>=1.7" "python-multipart>=0.0.17" \
        "minio>=7.2" "httpx>=0.27" "sse-starlette>=2.1" \
        "orjson>=3.10" "numpy>=1.26"

# App code + data + shared schemas
COPY apps/api/app ./app
COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./
COPY data ../data
COPY packages ../packages

# ---- Runtime stage keeps the final image lean ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY --from=build /app /app
COPY --from=build /data /data
COPY --from=build /packages /packages

# Entrypoint: migrate → seed (idempotent) → uvicorn
COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8000
CMD ["/docker-entrypoint.sh"]
