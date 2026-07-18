from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""

    database_url: str = "postgresql+asyncpg://echostand:echostand@localhost:5433/echostand"
    database_url_sync: str = "postgresql://echostand:echostand@localhost:5433/echostand"
    redis_url: str = "redis://localhost:6380/0"

    # Media storage — leave endpoint blank to disable photo/voice upload
    # (POST /media returns 501). All other flows work without it.
    minio_endpoint: str = ""
    minio_access_key: str = "echostand"
    minio_secret_key: str = "echostand-secret"
    minio_bucket: str = "echostand-media"
    minio_secure: bool = False

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    cors_origins: str = "http://localhost:3000"
    # Cookie SameSite for the anonymous fan session.
    # Set to "none" (and cookie_secure=True) for cross-origin deploys
    # (e.g. Vercel frontend calling a Fly.io backend). Default is dev-friendly.
    cookie_samesite: str = "lax"
    cookie_secure: bool = False

    fusion_tick_seconds: float = 3.0

    # Embeddings backend: "cohere" (default, cloud, free-tier friendly) or "local".
    embedding_backend: str = "cohere"
    embedding_model: str = "BAAI/bge-m3"          # only used when backend=local
    cohere_api_key: str = ""                       # required when backend=cohere

    claude_model_fast: str = "claude-haiku-4-5-20251001"
    claude_model_reason: str = "claude-sonnet-5"

    supported_languages: str = "en,es,fr,ar,pt,ko"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def supported_languages_list(self) -> list[str]:
        return [lang.strip() for lang in self.supported_languages.split(",") if lang.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
