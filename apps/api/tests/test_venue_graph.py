"""Tests for the Venue Graph in-memory helpers (Dijkstra + neighborhood BFS).

These are the primitives every geo-resolve and reroute call sits on. We
verify the algorithms rather than any specific venue's data.
"""
from __future__ import annotations

from collections import defaultdict

from app.fusion.venue_graph import Edge, Graph, Node


def _n(id: str, type: str = "concourse") -> Node:
    return Node(
        id=id, name=id, type=type, lat=0.0, lng=0.0, level=1,
        capacity=None, step_free=True, low_stimulus=True, is_open=True,
    )


def _e(a: str, b: str, d: float = 1.0, is_open: bool = True) -> Edge:
    return Edge(
        from_id=a, to_id=b, distance_m=d,
        step_free=True, width_m=3.0, low_stimulus=True, is_open=is_open,
    )


def _graph(nodes: list[Node], edges: list[Edge]) -> Graph:
    g = Graph(nodes={n.id: n for n in nodes}, adj=defaultdict(list))
    for e in edges:
        g.adj[e.from_id].append(e)
    return g


# ---------- neighborhood BFS -------------------------------------------------


def test_neighborhood_within_one_hop() -> None:
    g = _graph(
        [_n("a"), _n("b"), _n("c"), _n("d")],
        [_e("a", "b"), _e("b", "c"), _e("c", "d")],
    )
    hood = set(g.neighborhood("a", hops=1))
    assert hood == {"a", "b"}


def test_neighborhood_within_two_hops() -> None:
    g = _graph(
        [_n("a"), _n("b"), _n("c"), _n("d")],
        [_e("a", "b"), _e("b", "c"), _e("c", "d")],
    )
    hood = set(g.neighborhood("a", hops=2))
    assert hood == {"a", "b", "c"}


def test_neighborhood_of_unknown_node_is_empty() -> None:
    g = _graph([_n("a")], [])
    assert g.neighborhood("ghost", hops=5) == []


# ---------- shortest_path ----------------------------------------------------


def test_shortest_path_prefers_lower_distance() -> None:
    """Dijkstra should pick the shorter route even if it has more hops."""
    g = _graph(
        [_n("a"), _n("b"), _n("c"), _n("d")],
        [
            _e("a", "b", 100),       # direct but long
            _e("b", "d", 100),
            _e("a", "c", 1),         # detour but short
            _e("c", "d", 1),
        ],
    )
    path = g.shortest_path("a", goal="d")
    assert path == ["a", "c", "d"]


def test_shortest_path_respects_predicate() -> None:
    """Closed edges should be skipped by the default predicate."""
    g = _graph(
        [_n("a"), _n("b"), _n("c")],
        [
            _e("a", "b", 1, is_open=False),
            _e("a", "c", 10),
            _e("c", "b", 10),
        ],
    )
    path = g.shortest_path("a", goal="b")
    assert path == ["a", "c", "b"]


def test_shortest_path_unreachable_returns_empty() -> None:
    g = _graph(
        [_n("a"), _n("b")],
        [],  # no edges — disconnected
    )
    assert g.shortest_path("a", goal="b") == []


def test_shortest_path_until_type() -> None:
    """until_type stops at the first node of the requested type — used by
    nearest_by_type / plan_reroute."""
    g = _graph(
        [
            _n("start", type="section"),
            _n("mid", type="concourse"),
            _n("target", type="restroom"),
            _n("far", type="restroom"),
        ],
        [
            _e("start", "mid", 5),
            _e("mid", "target", 5),
            _e("target", "far", 100),
        ],
    )
    path = g.shortest_path("start", until_type="restroom")
    assert path[-1] == "target"


def test_nearest_by_type_returns_none_when_type_absent() -> None:
    g = _graph(
        [_n("a", type="section"), _n("b", type="concourse")],
        [_e("a", "b")],
    )
    assert g.nearest_by_type("a", "restroom") is None


def test_shortest_path_from_unknown_start_returns_empty() -> None:
    g = _graph([_n("a")], [])
    assert g.shortest_path("ghost", goal="a") == []
