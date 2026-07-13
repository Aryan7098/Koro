"""In-memory Venue Graph helpers.

Loaded once from Postgres on first use, refreshed on demand. The graph is
tiny (~30 nodes), so a full copy in memory is fine and makes neighborhood
lookups + Dijkstra (M10) trivial.
"""
from __future__ import annotations

import heapq
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VenueEdge, VenueNode


@dataclass
class Node:
    id: str
    name: str
    type: str
    lat: float
    lng: float
    level: int
    capacity: int | None
    step_free: bool
    low_stimulus: bool
    is_open: bool


@dataclass
class Edge:
    from_id: str
    to_id: str
    distance_m: float
    step_free: bool
    width_m: float
    low_stimulus: bool
    is_open: bool


@dataclass
class Graph:
    nodes: dict[str, Node] = field(default_factory=dict)
    adj: dict[str, list[Edge]] = field(default_factory=lambda: defaultdict(list))

    def neighborhood(self, node_id: str, hops: int = 2) -> list[str]:
        """BFS out to ``hops`` hops. Returns list of node ids including the seed."""
        if node_id not in self.nodes:
            return []
        seen = {node_id}
        frontier = [node_id]
        for _ in range(hops):
            next_frontier: list[str] = []
            for cur in frontier:
                for e in self.adj[cur]:
                    if e.to_id not in seen:
                        seen.add(e.to_id)
                        next_frontier.append(e.to_id)
            frontier = next_frontier
            if not frontier:
                break
        return list(seen)

    def nearest_by_type(
        self,
        from_id: str,
        node_type: str,
        edge_predicate: Callable[[Edge], bool] = lambda e: e.is_open,
    ) -> str | None:
        """Dijkstra: shortest step-count path to a node of the requested type."""
        path = self.shortest_path(from_id, predicate=edge_predicate, until_type=node_type)
        return path[-1] if path else None

    def shortest_path(
        self,
        start: str,
        goal: str | None = None,
        predicate: Callable[[Edge], bool] = lambda e: e.is_open,
        until_type: str | None = None,
    ) -> list[str]:
        """Dijkstra by distance_m. If ``goal`` is set, target that node id;
        if ``until_type`` is set, stop at the first node matching that type.
        Returns [] if unreachable.
        """
        if start not in self.nodes:
            return []
        pq: list[tuple[float, str, list[str]]] = [(0.0, start, [start])]
        seen: set[str] = set()
        while pq:
            cost, cur, path = heapq.heappop(pq)
            if cur in seen:
                continue
            seen.add(cur)
            if goal and cur == goal:
                return path
            if until_type and self.nodes[cur].type == until_type and cur != start:
                return path
            for e in self.adj[cur]:
                if not predicate(e):
                    continue
                if e.to_id in seen:
                    continue
                heapq.heappush(pq, (cost + e.distance_m, e.to_id, path + [e.to_id]))
        return []


_graph: Graph | None = None


async def load_graph(session: AsyncSession, force: bool = False) -> Graph:
    global _graph
    if _graph is not None and not force:
        return _graph
    nodes = (await session.execute(select(VenueNode))).scalars().all()
    edges = (await session.execute(select(VenueEdge))).scalars().all()
    g = Graph()
    for n in nodes:
        g.nodes[n.id] = Node(
            id=n.id, name=n.name, type=n.type, lat=n.lat, lng=n.lng,
            level=n.level, capacity=n.capacity, step_free=n.step_free,
            low_stimulus=n.low_stimulus, is_open=n.is_open,
        )
    for e in edges:
        g.adj[e.from_id].append(
            Edge(
                from_id=e.from_id, to_id=e.to_id, distance_m=e.distance_m,
                step_free=e.step_free, width_m=e.width_m,
                low_stimulus=e.low_stimulus, is_open=e.is_open,
            )
        )
    _graph = g
    return g


def invalidate_graph_cache() -> None:
    global _graph
    _graph = None
