"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("display_name", sa.String(128), nullable=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("tier", sa.String(4), nullable=False, server_default="T0"),
        sa.Column("reputation_score", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("language", sa.String(8), nullable=False, server_default="en"),
        sa.Column("accessibility_profile", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("home_node_id", sa.String(64), nullable=True),
        sa.Column("zone", sa.String(32), nullable=True),
        sa.Column("category_ownership", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "venue_nodes",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("lat", sa.Float, nullable=False),
        sa.Column("lng", sa.Float, nullable=False),
        sa.Column("level", sa.Integer, nullable=False, server_default="100"),
        sa.Column("capacity", sa.Integer, nullable=True),
        sa.Column("step_free", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("low_stimulus", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_open", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("metadata", sa.JSON, nullable=False, server_default="{}"),
    )

    op.create_table(
        "venue_edges",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("from_id", sa.String(64), sa.ForeignKey("venue_nodes.id"), nullable=False),
        sa.Column("to_id", sa.String(64), sa.ForeignKey("venue_nodes.id"), nullable=False),
        sa.Column("distance_m", sa.Float, nullable=False),
        sa.Column("step_free", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("width_m", sa.Float, nullable=False, server_default="2.0"),
        sa.Column("low_stimulus", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_open", sa.Boolean, nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_venue_edges_from", "venue_edges", ["from_id"])
    op.create_index("ix_venue_edges_to", "venue_edges", ["to_id"])

    op.create_table(
        "sops",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("embedding", Vector(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sops_category", "sops", ["category"])

    op.create_table(
        "canonical_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("node_id", sa.String(64), sa.ForeignKey("venue_nodes.id"), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="LOW"),
        sa.Column("severity_reason", sa.Text, nullable=True),
        sa.Column("confidence_band", sa.String(16), nullable=False, server_default="RUMOR"),
        sa.Column("confidence_score", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("canonical_summary", sa.Text, nullable=True),
        sa.Column("first_seen", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_mix", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("distinct_observers", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_canonical_events_node", "canonical_events", ["node_id"])
    op.create_index("ix_canonical_events_status", "canonical_events", ["status"])
    op.create_index("ix_canonical_events_last_seen", "canonical_events", ["last_seen"])

    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("source_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("device_fp", sa.String(64), nullable=True),
        sa.Column("raw_text", sa.Text, nullable=True),
        sa.Column("raw_language", sa.String(8), nullable=True),
        sa.Column("category_hint", sa.String(64), nullable=True),
        sa.Column("node_hint", sa.String(64), nullable=True),
        sa.Column("seat_hint", sa.String(32), nullable=True),
        sa.Column("media_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("device_context", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("normalized", sa.JSON, nullable=True),
        sa.Column("embedding", Vector(1024), nullable=True),
        sa.Column("confirms_event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("canonical_events.id"), nullable=True),
        sa.Column("confirm_value", sa.String(8), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_reports_source", "reports", ["source"])
    op.create_index("ix_reports_user", "reports", ["source_user_id"])
    op.create_index("ix_reports_device_fp", "reports", ["device_fp"])
    op.create_index("ix_reports_status", "reports", ["status"])
    op.create_index("ix_reports_created", "reports", ["created_at"])

    op.create_table(
        "event_reports",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("canonical_events.id"), primary_key=True),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("reports.id"), primary_key=True),
    )

    op.create_table(
        "pending_authorizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("canonical_events.id"), nullable=False),
        sa.Column("proposed_action", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("evidence", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("decision_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pending_auth_event", "pending_authorizations", ["event_id"])
    op.create_index("ix_pending_auth_status", "pending_authorizations", ["status"])
    op.create_index("ix_pending_auth_created", "pending_authorizations", ["created_at"])

    op.create_table(
        "resolution_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("canonical_events.id"), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("report_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("payload", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ledger_event", "resolution_ledger", ["event_id"])
    op.create_index("ix_ledger_action", "resolution_ledger", ["action"])
    op.create_index("ix_ledger_created", "resolution_ledger", ["created_at"])


def downgrade() -> None:
    op.drop_table("resolution_ledger")
    op.drop_table("pending_authorizations")
    op.drop_table("event_reports")
    op.drop_table("reports")
    op.drop_table("canonical_events")
    op.drop_table("sops")
    op.drop_table("venue_edges")
    op.drop_table("venue_nodes")
    op.drop_table("users")
