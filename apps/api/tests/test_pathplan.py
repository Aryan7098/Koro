"""Tests for the accessibility-aware Dijkstra path planner (PRD §FR8).

Design Commitment #1: routes must be computed by the graph, not the LLM.
These tests build small synthetic Venue Graphs and verify the planner
respects the mobility / sensory predicates and the "avoid this node"
constraint from the wheelchair-spill demo narrative in §3.10.
"""
from __future__ import annotations

from collections import defaultdict

from app.fusion.venue_graph import Edge, Graph, Node
from app.rendering.pathplan import plan_reroute


def _mk_node(id: str, type: str = "concourse", step_free: bool = True,
             low_stimulus: bool = True) -> Node:
    return Node(
        id=id, name=id.replace("_", " ").title(), type=type,
        lat=0.0, lng=0.0, level=1, capacity=None,
        step_free=step_free, low_stimulus=low_stimulus, is_open=True,
    )


def _mk_edge(a: str, b: str, *, distance: float = 10.0, step_free: bool = True,
             low_stimulus: bool = True, is_open: bool = True) -> Edge:
    return Edge(
        from_id=a, to_id=b, distance_m=distance, step_free=step_free,
        width_m=3.0, low_stimulus=low_stimulus, is_open=is_open,
    )


def _bidirectional_graph(nodes: list[Node], edges: list[tuple[str, str, dict]]) -> Graph:
    """Build a graph with each edge inserted both directions — matches how
    the seed loader creates them."""
    g = Graph(nodes={n.id: n for n in nodes}, adj=defaultdict(list))
    for a, b, kw in edges:
        g.adj[a].append(_mk_edge(a, b, **kw))
        g.adj[b].append(_mk_edge(b, a, **kw))
    return g


# ---------- planner picks nearest matching type -----------------------------


def test_plan_reroute_finds_nearest_restroom() -> None:
    """Section → nearest restroom of a different node than the avoided one."""
    nodes = [
        _mk_node("sec_112", type="section"),
        _mk_node("concourse_a", type="concourse"),
        _mk_node("restroom_112", type="restroom"),  # closer, but avoided
        _mk_node("restroom_113", type="restroom"),  # farther, should be picked
    ]
    edges = [
        ("sec_112", "concourse_a", {"distance": 10}),
        ("concourse_a", "restroom_112", {"distance": 5}),
        ("concourse_a", "restroom_113", {"distance": 30}),
    ]
    g = _bidirectional_graph(nodes, edges)

    route = plan_reroute(g, from_id="sec_112", category="spill", avoid_id="restroom_112")
    assert route.to_id == "restroom_113"
    assert "restroom_112" not in route.node_path
    assert route.distance_m > 0


# ---------- unknown category returns empty route ----------------------------


def test_unknown_category_returns_empty_route() -> None:
    g = _bidirectional_graph(
        [_mk_node("sec_112", type="section")],
        [],
    )
    route = plan_reroute(g, from_id="sec_112", category="not_a_category")
    assert route.node_path == []
    assert route.to_id is None


# ---------- mobility predicate excludes non-step-free edges -----------------


def test_mobility_predicate_avoids_stairs() -> None:
    """A wheelchair user must never be routed through a step-free=False edge
    when a step-free alternative exists."""
    nodes = [
        _mk_node("sec_112", type="section"),
        _mk_node("stairs_hub", type="concourse"),
        _mk_node("elev_hub", type="concourse"),
        _mk_node("restroom_target", type="restroom"),
    ]
    edges = [
        ("sec_112", "stairs_hub", {"distance": 5, "step_free": False}),
        ("stairs_hub", "restroom_target", {"distance": 5, "step_free": False}),
        ("sec_112", "elev_hub", {"distance": 20, "step_free": True}),
        ("elev_hub", "restroom_target", {"distance": 20, "step_free": True}),
    ]
    g = _bidirectional_graph(nodes, edges)

    route = plan_reroute(
        g,
        from_id="sec_112",
        category="restroom",
        accessibility={"mobility": True},
    )
    assert "stairs_hub" not in route.node_path
    assert "elev_hub" in route.node_path


# ---------- sensory predicate excludes loud corridors -----------------------


def test_sensory_predicate_avoids_loud_corridor() -> None:
    nodes = [
        _mk_node("sec_202", type="section"),
        _mk_node("loud_hub", type="concourse", low_stimulus=False),
        _mk_node("quiet_hub", type="concourse"),
        _mk_node("restroom_q", type="restroom"),
    ]
    edges = [
        ("sec_202", "loud_hub", {"distance": 5, "low_stimulus": False}),
        ("loud_hub", "restroom_q", {"distance": 5, "low_stimulus": False}),
        ("sec_202", "quiet_hub", {"distance": 30, "low_stimulus": True}),
        ("quiet_hub", "restroom_q", {"distance": 30, "low_stimulus": True}),
    ]
    g = _bidirectional_graph(nodes, edges)

    route = plan_reroute(
        g,
        from_id="sec_202",
        category="restroom",
        accessibility={"sensory": True},
    )
    assert "loud_hub" not in route.node_path


# ---------- fallback when strict predicate cannot route ---------------------


def test_planner_falls_back_when_no_accessible_route() -> None:
    """If nothing satisfies the accessibility predicate, the planner should
    still return SOMETHING (with a reason explaining the compromise) rather
    than leaving a fan stranded."""
    nodes = [
        _mk_node("sec_112", type="section"),
        _mk_node("stairs_hub", type="concourse"),
        _mk_node("restroom_target", type="restroom"),
    ]
    edges = [
        ("sec_112", "stairs_hub", {"step_free": False}),
        ("stairs_hub", "restroom_target", {"step_free": False}),
    ]
    g = _bidirectional_graph(nodes, edges)

    route = plan_reroute(
        g,
        from_id="sec_112",
        category="restroom",
        accessibility={"mobility": True},
    )
    assert route.to_id == "restroom_target"
    assert "not fully honored" in route.reason


# ---------- unknown start node returns empty route --------------------------


def test_unknown_start_node_returns_empty_route() -> None:
    g = _bidirectional_graph([_mk_node("a", type="restroom")], [])
    route = plan_reroute(g, from_id="ghost_node", category="restroom")
    assert route.node_path == []


# ---------- prompt block never invents nodes --------------------------------


def test_prompt_block_only_names_path_nodes() -> None:
    """The as_prompt_block() output is what the LLM sees — it must reference
    ONLY the exact path nodes so Claude cannot invent shortcuts."""
    nodes = [
        _mk_node("sec_112", type="section"),
        _mk_node("concourse_a", type="concourse"),
        _mk_node("restroom_113", type="restroom"),
    ]
    edges = [
        ("sec_112", "concourse_a", {}),
        ("concourse_a", "restroom_113", {}),
    ]
    g = _bidirectional_graph(nodes, edges)
    route = plan_reroute(g, from_id="sec_112", category="restroom")
    block = route.as_prompt_block()
    for name in route.node_names:
        assert name in block
    assert "no other" in block  # the "do not name" instruction is present
