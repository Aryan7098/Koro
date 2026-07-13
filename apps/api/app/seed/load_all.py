"""Seed the database with MetLife venue graph, SOP corpus, and demo users.

Idempotent — safe to re-run. Uses a synchronous SQLAlchemy engine because we
don't need async here and it makes error handling straightforward.

Run:
    python -m app.seed.load_all
"""
from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import SOP, User, VenueEdge, VenueNode
from app.models.user import Role, Tier

REPO_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = REPO_ROOT / "data"


def load_venue(session: Session) -> None:
    payload = json.loads((DATA_DIR / "metlife_venue.json").read_text(encoding="utf-8"))

    for node in payload["nodes"]:
        stmt = pg_insert(VenueNode).values(
            id=node["id"],
            name=node["name"],
            type=node["type"],
            lat=node["lat"],
            lng=node["lng"],
            level=node.get("level", 100),
            capacity=node.get("capacity"),
            step_free=node.get("step_free", True),
            low_stimulus=node.get("low_stimulus", False),
            is_open=node.get("is_open", True),
            node_metadata=node.get("metadata", {}),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": stmt.excluded.name,
                "type": stmt.excluded.type,
                "lat": stmt.excluded.lat,
                "lng": stmt.excluded.lng,
                "level": stmt.excluded.level,
                "capacity": stmt.excluded.capacity,
                "step_free": stmt.excluded.step_free,
                "low_stimulus": stmt.excluded.low_stimulus,
                "is_open": stmt.excluded.is_open,
                "metadata": stmt.excluded.metadata,
            },
        )
        session.execute(stmt)

    # Wipe & re-insert edges (they're derived, cheap, and we may reshape them)
    session.query(VenueEdge).delete()
    for edge in payload["edges"]:
        # Bidirectional — insert both directions so Dijkstra is symmetric
        for a, b in ((edge["from"], edge["to"]), (edge["to"], edge["from"])):
            session.add(
                VenueEdge(
                    from_id=a,
                    to_id=b,
                    distance_m=edge["distance_m"],
                    step_free=edge.get("step_free", True),
                    width_m=edge.get("width_m", 2.0),
                    low_stimulus=edge.get("low_stimulus", False),
                    is_open=edge.get("is_open", True),
                )
            )
    session.commit()
    print(f"  loaded {len(payload['nodes'])} nodes and {len(payload['edges']) * 2} directed edges")


SOP_RE = re.compile(r"^## SOP:\s*(?P<title>.+?)\n(?:category:\s*(?P<category>\S+)\n)?", re.M)


def load_sops(session: Session) -> None:
    text = (DATA_DIR / "sops.md").read_text(encoding="utf-8")
    # Split on `## SOP:` headers
    parts = re.split(r"^(?=## SOP:)", text, flags=re.M)
    entries: list[tuple[str, str, str]] = []
    for part in parts:
        m = SOP_RE.match(part)
        if not m:
            continue
        title = m.group("title").strip()
        category = (m.group("category") or "general").strip()
        body = part[m.end():].strip()
        entries.append((title, category, body))

    # Idempotent: wipe existing and re-insert (small corpus).
    session.query(SOP).delete()
    for title, category, body in entries:
        session.add(
            SOP(
                id=uuid.uuid4(),
                title=title,
                category=category,
                text=body,
                embedding=None,  # populated by fusion warm-up
            )
        )
    session.commit()
    print(f"  loaded {len(entries)} SOP entries")


DEMO_USERS = [
    # Fans (T0/T1) with varied languages and accessibility profiles
    {
        "username": "fan_maria",
        "display_name": "María",
        "role": Role.FAN.value,
        "tier": Tier.T1.value,
        "language": "es",
        "accessibility_profile": {},
        "home_node_id": "section_112",
    },
    {
        "username": "fan_wei",
        "display_name": "Wei",
        "role": Role.FAN.value,
        "tier": Tier.T1.value,
        "language": "ko",
        "accessibility_profile": {},
        "home_node_id": "section_119",
    },
    {
        "username": "fan_jamil",
        "display_name": "Jamil",
        "role": Role.FAN.value,
        "tier": Tier.T1.value,
        "language": "ar",
        "accessibility_profile": {"mobility": True},
        "home_node_id": "section_112",
    },
    {
        "username": "fan_ana",
        "display_name": "Ana",
        "role": Role.FAN.value,
        "tier": Tier.T1.value,
        "language": "pt",
        "accessibility_profile": {"sensory": True},
        "home_node_id": "section_212",
    },
    {
        "username": "fan_luc",
        "display_name": "Luc",
        "role": Role.FAN.value,
        "tier": Tier.T1.value,
        "language": "fr",
        "accessibility_profile": {},
        "home_node_id": "section_324",
    },
    # Volunteers (T2), zoned to specific parts of the venue
    {
        "username": "vol_north",
        "display_name": "Priya (Volunteer)",
        "role": Role.VOLUNTEER.value,
        "tier": Tier.T2.value,
        "language": "en",
        "zone": "north_100",
    },
    {
        "username": "vol_south",
        "display_name": "Diego (Volunteer)",
        "role": Role.VOLUNTEER.value,
        "tier": Tier.T2.value,
        "language": "en",
        "zone": "south_100",
    },
    {
        "username": "vol_mezz",
        "display_name": "Aisha (Volunteer)",
        "role": Role.VOLUNTEER.value,
        "tier": Tier.T2.value,
        "language": "en",
        "zone": "mezz_200",
    },
    # Staff (T3), with category ownership
    {
        "username": "staff_ops",
        "display_name": "Ops Control",
        "role": Role.STAFF.value,
        "tier": Tier.T3.value,
        "language": "en",
        "category_ownership": ["spill", "restroom", "vendor", "gate", "wayfinding", "crowd"],
    },
    {
        "username": "staff_medical",
        "display_name": "Medical Supervisor",
        "role": Role.STAFF.value,
        "tier": Tier.T3.value,
        "language": "en",
        "category_ownership": ["medical"],
    },
    {
        "username": "staff_security",
        "display_name": "Security Lead",
        "role": Role.STAFF.value,
        "tier": Tier.T3.value,
        "language": "en",
        "category_ownership": ["security", "structural"],
    },
    # Organizer
    {
        "username": "organizer",
        "display_name": "Match Organizer",
        "role": Role.ORGANIZER.value,
        "tier": Tier.T3.value,
        "language": "en",
    },
]


def load_users(session: Session) -> None:
    for spec in DEMO_USERS:
        existing = session.execute(
            select(User).where(User.username == spec["username"])
        ).scalar_one_or_none()
        if existing:
            for k, v in spec.items():
                setattr(existing, k, v)
            continue
        session.add(User(id=uuid.uuid4(), **spec))
    session.commit()
    print(f"  loaded {len(DEMO_USERS)} demo users")


def main() -> None:
    engine = create_engine(settings.database_url_sync, future=True)
    with Session(engine) as session:
        print("Seeding EchoStand database …")
        print("- Venue graph (MetLife)")
        load_venue(session)
        print("- SOP corpus")
        load_sops(session)
        print("- Demo users")
        load_users(session)
        print("Done.")


if __name__ == "__main__":
    main()
