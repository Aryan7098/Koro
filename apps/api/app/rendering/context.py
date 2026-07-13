"""Rendering context — builds the cached system prompt block.

The Venue Graph subset + SOP snippets go into a single ``cached`` block that
Anthropic's prompt cache holds for 1h. Reused across every rendering call for
this event, which is what makes the multi-audience×multi-language cost bounded.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.fusion.venue_graph import Graph, load_graph
from app.models import SOP


@dataclass
class RenderContext:
    node_id: str
    category: str
    graph: Graph
    graph_subset_ids: list[str]
    sops: list[dict]

    def cached_system(self, role_intro: str) -> str:
        subset_nodes = [
            {
                "id": self.graph.nodes[n].id,
                "name": self.graph.nodes[n].name,
                "type": self.graph.nodes[n].type,
                "level": self.graph.nodes[n].level,
                "step_free": self.graph.nodes[n].step_free,
                "low_stimulus": self.graph.nodes[n].low_stimulus,
                "is_open": self.graph.nodes[n].is_open,
            }
            for n in self.graph_subset_ids
            if n in self.graph.nodes
        ]
        subset_edges = []
        subset_set = set(self.graph_subset_ids)
        for src, adj in self.graph.adj.items():
            if src not in subset_set:
                continue
            for e in adj:
                if e.to_id in subset_set:
                    subset_edges.append(
                        {
                            "from": e.from_id,
                            "to": e.to_id,
                            "distance_m": e.distance_m,
                            "step_free": e.step_free,
                            "low_stimulus": e.low_stimulus,
                            "is_open": e.is_open,
                        }
                    )

        return "\n".join(
            [
                role_intro,
                "",
                "You never invent venue facts. Every node_id you emit must come "
                "from the provided graph subset. If a needed fact isn't there, "
                'return "UNCERTAIN" instead of guessing.',
                "",
                "Venue graph (subset, JSON):",
                json.dumps({"nodes": subset_nodes, "edges": subset_edges},
                           ensure_ascii=False, indent=2),
                "",
                "Applicable SOPs (grounded — do not deviate):",
                *(f"### {s['title']}\n{s['text']}" for s in self.sops),
            ]
        )


async def build_context(
    session: AsyncSession, node_id: str, category: str, hops: int = 2
) -> RenderContext:
    graph = await load_graph(session)
    subset = graph.neighborhood(node_id, hops=hops)
    if not subset:
        subset = [node_id] if node_id in graph.nodes else list(graph.nodes.keys())[:10]

    sop_rows = (
        await session.execute(
            select(SOP).where(SOP.category.in_([category, "closure", "wayfinding"]))
        )
    ).scalars().all()
    sops = [{"title": s.title, "text": s.text, "category": s.category} for s in sop_rows]

    return RenderContext(
        node_id=node_id,
        category=category,
        graph=graph,
        graph_subset_ids=subset,
        sops=sops,
    )
