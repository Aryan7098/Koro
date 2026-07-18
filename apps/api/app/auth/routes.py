"""Auth routes.

- POST /auth/login             — role picker; returns JWT (volunteer/staff/organizer/known fan).
- POST /auth/fan-session       — anonymous fan session; returns a device_fp cookie value.
- GET  /auth/me                — returns the current user (bearer) or the anon device_fp.

This is deliberately minimal — hackathon shortcut. No passwords; usernames from the
seeded demo users are enough. Documented as such in the README.
"""
from __future__ import annotations

import hashlib
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_token, current_user
from app.core.db import get_session
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginBody,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LoginResponse:
    stmt = select(User).where(User.username == body.username)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown user")
    return LoginResponse(
        access_token=create_token(user),
        user={
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
            "tier": user.tier,
            "language": user.language,
            "accessibility_profile": user.accessibility_profile,
            "home_node_id": user.home_node_id,
            "zone": user.zone,
            "category_ownership": user.category_ownership,
        },
    )


class FanSessionResponse(BaseModel):
    device_fp: str


@router.post("/fan-session", response_model=FanSessionResponse)
async def fan_session(request: Request, response: Response) -> FanSessionResponse:
    """Mint an anonymous device fingerprint cookie for a fan.

    We include an entropy seed from the client (User-Agent + Accept-Language + a random)
    to make it stable per-browser but not linkable to identity.
    """
    existing = request.cookies.get("echostand_fp")
    if existing:
        return FanSessionResponse(device_fp=existing)

    ua = request.headers.get("user-agent", "")
    al = request.headers.get("accept-language", "")
    salt = secrets.token_hex(8)
    fp = hashlib.sha256(f"{ua}|{al}|{salt}".encode()).hexdigest()[:32]
    response.set_cookie(
        "echostand_fp",
        fp,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
    )
    return FanSessionResponse(device_fp=fp)


@router.get("/me")
async def me(user: Annotated[User, Depends(current_user)]) -> dict:
    return {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "tier": user.tier,
        "language": user.language,
        "accessibility_profile": user.accessibility_profile,
        "home_node_id": user.home_node_id,
        "zone": user.zone,
        "category_ownership": user.category_ownership,
    }


class ProfilePatch(BaseModel):
    language: str | None = None
    home_node_id: str | None = None
    accessibility_profile: dict | None = None


@router.patch("/me")
async def patch_me(
    body: ProfilePatch,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Let fans toggle their language / home node / accessibility profile from the UI.

    Every field is optional; unspecified fields stay put.
    """
    if body.language is not None:
        user.language = body.language
    if body.home_node_id is not None:
        user.home_node_id = body.home_node_id or None
    if body.accessibility_profile is not None:
        # Only persist the known keys — silently drop anything else
        user.accessibility_profile = {
            "mobility": bool(body.accessibility_profile.get("mobility", False)),
            "sensory": bool(body.accessibility_profile.get("sensory", False)),
        }
    await session.commit()
    return {
        "id": str(user.id),
        "language": user.language,
        "home_node_id": user.home_node_id,
        "accessibility_profile": user.accessibility_profile,
    }
