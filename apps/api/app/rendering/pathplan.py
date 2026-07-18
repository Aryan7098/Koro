"""Deterministic accessibility-aware path planner.

Design Commitment #1: routes are computed by Dijkstra against the Venue Graph
and *fed* to Claude for prose. The model never invents nodes or paths.

The planner takes:
    - a start node (where the fan is now),
    - a target predicate (e.g. "nearest open restroom that isn't ``avoid``"),
    - accessibility flags (mobility → step_free edges; sensory → low_stimulus edges).

Output is a concrete list of node ids the fan should traverse, along with a
brief structured summary the renderer can inline into the system prompt.

Target selection rules (per PRD §3.10 wheelchair spill demo):
    - Categories with a same-type alternative use ``TARGET_TYPE_BY_CATEGORY``.
    - Categories without a same-type alternative (wayfinding, crowd, medical,
      security, structural) get a graph-consistent fallback (nearest exit for
      crowd/security/structural, nearest medical for medical, nothing for
      wayfinding — the fan's own destination is the target).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.fusion.venue_graph import Edge, Graph, Node


# Category → nearest node type to redirect toward. If the event happens at the
# node itself, we look for a *different* node of that type.
TARGET_TYPE_BY_CATEGORY: dict[str, str] = {
    "spill": "restroom",       # if the spill is near a restroom, find another
    "restroom": "restroom",
    "vendor": "vendor",
    "smell": "restroom",       # smell events are usually restroom-adjacent
    "gate": "gate",
    "crowd": "exit",
    "medical": "medical",
    "security": "exit",
    "structural": "exit",
}


@dataclass(frozen=True)
class PlannedRoute:
    from_id: str
    to_id: str | None
    node_path: list[str]        # ordered ids from start → target
    node_names: list[str]       # parallel names for LLM prompt
    distance_m: float
    step_free: bool
    low_stimulus: bool
    accessibility: dict[str, bool]
    reason: str

    def as_prompt_block(self) -> str:
        if not self.node_path:
            return "PLANNED ROUTE: (none — the model may suggest none)"
        acc = []
        if self.accessibility.get("mobility"):
            acc.append("step-free (mobility)")
        if self.accessibility.get("sensory"):
            acc.append("low-stimulus (sensory)")
        acc_line = f" [{', '.join(acc)}]" if acc else ""
        return (
            f"PLANNED ROUTE{acc_line} — you MUST reference this exact path, "
            f"no other. Do not name any node not listed here.\n"
            f"  from: {self.from_id}\n"
            f"  to:   {self.to_id}\n"
            f"  path: {' → '.join(self.node_names)}\n"
            f"  distance ≈ {self.distance_m:.0f} m\n"
            f"  reason: {self.reason}\n"
        )


def _edge_predicate(mobility: bool, sensory: bool) -> Callable[[Edge], bool]:
    def ok(e: Edge) -> bool:
        if not e.is_open:
            return False
        if mobility and not e.step_free:
            return False
        if sensory and not e.low_stimulus:
            return False
        return True

    return ok


def plan_reroute(
    graph: Graph,
    *,
    from_id: str,
    category: str,
    avoid_id: str | None = None,
    accessibility: dict | None = None,
) -> PlannedRoute:
    """Compute a graph-verified reroute for a fan near ``avoid_id``.

    - If category has no target type in the map, return an empty route (the
      LLM will handle the wayfinding case without a fixed path).
    - Prefer a path that goes AROUND ``avoid_id`` if provided (edges touching
      it are excluded); if that's impossible, fall back to allowing them.
    """
    accessibility = accessibility or {}
    mobility = bool(accessibility.get("mobility"))
    sensory = bool(accessibility.get("sensory"))

    target_type = TARGET_TYPE_BY_CATEGORY.get(category)
    if target_type is None or from_id not in graph.nodes:
        return PlannedRoute(
            from_id=from_id, to_id=None, node_path=[], node_names=[],
            distance_m=0.0, step_free=True, low_stimulus=sensory,
            accessibility={"mobility": mobility, "sensory": sensory},
            reason="no reroute needed for this category",
        )

    base_pred = _edge_predicate(mobility, sensory)

    def with_avoid(e: Edge) -> bool:
        if not base_pred(e):
            return False
        if avoid_id and (e.from_id == avoid_id or e.to_id == avoid_id):
            return False
        return True

    # First attempt: strict avoid + accessibility.
    path = graph.shortest_path(from_id, predicate=with_avoid, until_type=target_type)
    reason = f"nearest open {target_type}, avoiding {avoid_id}" if avoid_id else \
        f"nearest open {target_type}"

    # If nothing found, relax the avoid_id constraint.
    if not path or path[-1] == from_id:
        path = graph.shortest_path(from_id, predicate=base_pred, until_type=target_type)
        if path:
            reason = f"nearest open {target_type} (couldn't route around {avoid_id})"

    # Still nothing? Relax accessibility as the last resort.
    if not path or path[-1] == from_id:
        path = graph.shortest_path(from_id, predicate=lambda e: e.is_open,
                                    until_type=target_type)
        if path:
            reason = (
                f"nearest open {target_type} (accessibility preferences not fully honored — "
                f"no matching route)"
            )

    if not path or len(path) < 2:
        return PlannedRoute(
            from_id=from_id, to_id=None, node_path=[], node_names=[],
            distance_m=0.0, step_free=True, low_stimulus=sensory,
            accessibility={"mobility": mobility, "sensory": sensory},
            reason=f"no reachable {target_type}",
        )

    to_id = path[-1]
    names = [graph.nodes[n].name for n in path if n in graph.nodes]

    # Sum path distance (edges are directed — assume our graph seed made them
    # bidirectional, which it does).
    total = 0.0
    for a, b in zip(path[:-1], path[1:]):
        for e in graph.adj[a]:
            if e.to_id == b:
                total += e.distance_m
                break

    return PlannedRoute(
        from_id=from_id, to_id=to_id, node_path=path, node_names=names,
        distance_m=total,
        step_free=all(_edge_used_matches(graph, path, step_free=True)),
        low_stimulus=all(_edge_used_matches(graph, path, low_stimulus=True)),
        accessibility={"mobility": mobility, "sensory": sensory},
        reason=reason,
    )


def _edge_used_matches(
    graph: Graph, path: list[str], *, step_free: bool | None = None,
    low_stimulus: bool | None = None,
) -> list[bool]:
    out = []
    for a, b in zip(path[:-1], path[1:]):
        for e in graph.adj[a]:
            if e.to_id == b:
                ok = True
                if step_free is not None:
                    ok = ok and e.step_free == step_free
                if low_stimulus is not None:
                    ok = ok and e.low_stimulus == low_stimulus
                out.append(ok)
                break
    return out
