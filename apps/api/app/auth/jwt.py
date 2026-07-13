"""JWT helpers.

Hackathon-simple auth: role-picker login → JWT signed with HS256.
Fan is anonymous with a device_fp cookie (no JWT).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.models import User


def create_token(user: User) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "tier": user.tier,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_expire_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=f"invalid token: {e}") from e


async def _load_user(session: AsyncSession, user_id: str) -> User:
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    user = (await session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


async def current_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    payload = decode_token(auth.split(" ", 1)[1])
    return await _load_user(session, payload["sub"])


def require_role(*roles: str):
    async def _dep(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"role {user.role} not allowed; requires one of {list(roles)}",
            )
        return user

    return _dep
