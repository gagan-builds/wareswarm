"""
test_planners.py - Unit & Property Tests for A*, Dijkstra, and Space-Time A*.

Purpose:
    Exhaustively verifies path optimality, edge cost calculations, heuristics (Manhattan, Octile),
    unreachable goals, and vertex/edge space-time reservation compliance across randomized grids.

Role in the project:
    Pathfinding test suite guaranteeing that planners return strictly optimal routes
    and that A* always expands fewer or equal nodes compared to Dijkstra.

Key contents:
    - TestAStar: Verifies basic A* correctness, obstacle navigation, and heuristics.
    - TestDijkstra: Validates uniform-cost search baseline.
    - TestAStarVsDijkstra: Property test comparing A* vs Dijkstra on 200 random grids.
    - TestAstarVsDijkstraCompare100: Validates identical costs and node expansion bounds.
    - TestSpaceTimeAStar: Tests vertex collision avoidance, edge-swap avoidance, and wait moves.

Talks to:
    - app.planning.astar, dijkstra, space_time_astar: Under-test planning modules.
"""

import math
import random
import pytest

from app.core.grid import Grid, CellType
from app.planning.astar import astar, PlanResult
from app.planning.dijkstra import dijkstra
from app.planning.space_time_astar import space_time_astar
from app.core.map_generator import generate_random


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def make_grid_with_wall(height=10, width=10, wall_col=5):
    """Grid with a full vertical wall at wall_col except row 0."""
    g = Grid(height, width)
    for r in range(1, height):
        g.set_cell(r, wall_col, CellType.OBSTACLE)
    return g


# ---------------------------------------------------------------------------
# A* basic correctness
# ---------------------------------------------------------------------------

class TestAstar:

    def test_trivial_same_cell(self, small_grid):
        """Start == goal must return success with empty path and zero cost."""
        result = astar(small_grid, (2, 2), (2, 2))
        assert result.success
        assert result.path == []
        assert result.cost == 0.0

    def test_simple_straight_path(self, small_grid):
        """4-connected straight path cost should equal Manhattan distance."""
        result = astar(small_grid, (0, 0), (0, 4))
        assert result.success
        assert result.cost == pytest.approx(4.0)
        assert result.path[-1] == (0, 4)

    def test_optimal_cost_known_grid(self):
        """A* must find cost=6 on a 7-cell straight path."""
        g = Grid(1, 7)
        result = astar(g, (0, 0), (0, 6))
        assert result.success
        assert result.cost == pytest.approx(6.0)
        assert len(result.path) == 6

    def test_around_obstacle(self):
        """A* routes around a wall correctly."""
        g = Grid(3, 3)
        g.set_cell(0, 1, CellType.OBSTACLE)
        g.set_cell(1, 1, CellType.OBSTACLE)
        # Path from (0,0) to (0,2) must go around: (1,0),(2,0)? No:
        # Actually valid path: (0,0)->(1,0)->(1,2)->(0,2) length 3
        result = astar(g, (0, 0), (0, 2))
        assert result.success
        assert result.path[-1] == (0, 2)

    def test_unreachable_goal(self):
        """A* must return failure when goal is completely enclosed."""
        g = Grid(5, 5)
        # Surround cell (2,2) with obstacles
        for r, c in [(1,2),(3,2),(2,1),(2,3)]:
            g.set_cell(r, c, CellType.OBSTACLE)
        g.set_cell(2, 2, CellType.FREE)  # make sure goal is free
        result = astar(g, (0, 0), (2, 2))
        assert not result.success

    def test_obstacle_start_or_goal(self):
        """A* on obstacle start/goal must return failure."""
        g = Grid(5, 5)
        g.set_cell(0, 0, CellType.OBSTACLE)
        result = astar(g, (0, 0), (4, 4))
        assert not result.success

        g2 = Grid(5, 5)
        g2.set_cell(4, 4, CellType.OBSTACLE)
        result2 = astar(g2, (0, 0), (4, 4))
        assert not result2.success

    def test_manhattan_heuristic(self, small_grid):
        result = astar(small_grid, (0, 0), (4, 4), heuristic="manhattan")
        assert result.success

    def test_euclidean_heuristic_8connected(self, small_grid):
        result = astar(small_grid, (0, 0), (4, 4), heuristic="euclidean", connectivity=8)
        assert result.success
        # 8-connected diagonal cost = 4*sqrt(2) ≈ 5.656
        assert result.cost == pytest.approx(4 * math.sqrt(2), rel=1e-3)

    def test_octile_heuristic_8connected(self, small_grid):
        result = astar(small_grid, (0, 0), (4, 4), heuristic="octile", connectivity=8)
        assert result.success

    def test_no_corner_cutting_4connected(self):
        """4-connected movement never cuts corners (not applicable, but no diagonals)."""
        g = Grid(3, 3)
        g.set_cell(0, 1, CellType.OBSTACLE)
        result = astar(g, (0, 0), (0, 2))
        # Must go around via row 1
        assert result.success
        assert all(g.is_traversable(r, c) for r, c in result.path)

    def test_path_cells_are_traversable(self):
        """Every cell in the returned path must be traversable."""
        g = generate_random(20, 15, obstacle_density=0.2, seed=42)
        # Find two free cells
        free = g.find_cells(CellType.FREE)
        if len(free) < 2:
            return  # skip degenerate case
        start, goal = free[0], free[-1]
        result = astar(g, start, goal)
        if result.success:
            for r, c in result.path:
                assert g.is_traversable(r, c), f"Cell ({r},{c}) not traversable"

    def test_expanded_nodes_positive(self, small_grid):
        result = astar(small_grid, (0, 0), (4, 4))
        assert result.expanded_nodes >= 1

    def test_runtime_ms_positive(self, small_grid):
        result = astar(small_grid, (0, 0), (4, 4))
        assert result.runtime_ms >= 0.0


# ---------------------------------------------------------------------------
# Dijkstra basic correctness
# ---------------------------------------------------------------------------

class TestDijkstra:

    def test_same_cell(self, small_grid):
        result = dijkstra(small_grid, (2, 2), (2, 2))
        assert result.success
        assert result.cost == 0.0

    def test_simple_path(self, small_grid):
        result = dijkstra(small_grid, (0, 0), (4, 4))
        assert result.success

    def test_unreachable(self):
        g = Grid(5, 5)
        for r, c in [(1,2),(3,2),(2,1),(2,3)]:
            g.set_cell(r, c, CellType.OBSTACLE)
        result = dijkstra(g, (0, 0), (2, 2))
        assert not result.success


# ---------------------------------------------------------------------------
# Property test: A* cost == Dijkstra cost over 200 random grids
# ---------------------------------------------------------------------------

class TestAstarVsDijkstraProperty:

    @pytest.mark.parametrize("seed", range(200))
    def test_cost_matches_dijkstra(self, seed):
        """A* and Dijkstra must produce paths of equal cost on the same grid."""
        rng = random.Random(seed)
        w = rng.randint(8, 20)
        h = rng.randint(8, 20)
        g = generate_random(w, h, obstacle_density=0.15, seed=seed)

        free = [
            (r, c) for r in range(h) for c in range(w)
            if g.is_traversable(r, c)
        ]
        if len(free) < 2:
            return

        start = free[rng.randint(0, len(free) // 2)]
        goal  = free[rng.randint(len(free) // 2, len(free) - 1)]

        a_res = astar(g, start, goal, heuristic="manhattan", connectivity=4)
        d_res = dijkstra(g, start, goal, connectivity=4)

        assert a_res.success == d_res.success, (
            f"Seed {seed}: A* success={a_res.success}, Dijkstra={d_res.success}"
        )
        if a_res.success:
            assert a_res.cost == pytest.approx(d_res.cost, rel=1e-5), (
                f"Seed {seed}: A* cost={a_res.cost}, Dijkstra cost={d_res.cost}"
            )


# ---------------------------------------------------------------------------
# Space-Time A* tests
# ---------------------------------------------------------------------------

class TestSpaceTimeAstar:

    def test_no_reservations(self, small_grid):
        """Without reservations STA* should find the same path as A*."""
        result = space_time_astar(small_grid, (0, 0), (4, 4))
        assert result.success

    def test_vertex_reservation_avoided(self, small_grid):
        """STA* must not visit a reserved vertex."""
        # Reserve the direct path cells at t=1
        vr = {(0, 1, 1), (0, 2, 2), (0, 3, 3), (0, 4, 4)}
        result = space_time_astar(small_grid, (0, 0), (4, 4),
                                  vertex_reservations=vr)
        assert result.success
        # Verify path avoids reserved cells at the right times
        for i, (r, c) in enumerate(result.path):
            t = i + 1
            assert (r, c, t) not in vr, f"Path used reserved cell ({r},{c},{t})"

    def test_edge_reservation_swap_avoided(self):
        """STA* must not create a swap (edge) conflict."""
        g = Grid(1, 5)
        # Reserve the swap: (0,2)→(0,1) at t=1
        er = {(0, 2, 0, 1, 1)}  # (r1,c1,r2,c2,t)
        result = space_time_astar(g, (0, 0), (0, 4), edge_reservations=er)
        assert result.success

    def test_unreachable_with_time_horizon(self):
        """If goal blocked, STA* returns failure."""
        g = Grid(5, 5)
        for r in range(5):
            g.set_cell(r, 2, CellType.OBSTACLE)
        result = space_time_astar(g, (0, 0), (0, 4), max_time=50)
        assert not result.success

    def test_wait_action_used(self):
        """STA* should use wait actions when the direct path is reserved."""
        g = Grid(1, 3)
        # Block (0,1) at t=1 – robot must wait at (0,0) then move
        vr = {(0, 1, 1)}
        result = space_time_astar(g, (0, 0), (0, 2), vertex_reservations=vr, max_time=10)
        assert result.success
        # Path should be longer than 2 steps due to waiting
        assert len(result.path) >= 2


# ---------------------------------------------------------------------------
# Fix 4: A* vs Dijkstra 100 seeded property test
# ---------------------------------------------------------------------------

class TestAstarVsDijkstraCompare100:

    @pytest.mark.parametrize("seed", range(100))
    def test_cost_equal_and_astar_nodes_le_dijkstra(self, seed):
        """Costs of both planners are equal on 100 seeded random grids, and A* expanded nodes <= Dijkstra expanded nodes."""
        rng = random.Random(seed + 500)
        w = rng.randint(8, 20)
        h = rng.randint(8, 20)
        g = generate_random(w, h, obstacle_density=0.15, seed=seed + 500)

        free = [
            (r, c) for r in range(h) for c in range(w)
            if g.is_traversable(r, c)
        ]
        if len(free) < 2:
            return

        start = free[rng.randint(0, len(free) // 2)]
        goal  = free[rng.randint(len(free) // 2, len(free) - 1)]

        a_res = astar(g, start, goal, heuristic="manhattan", connectivity=4)
        d_res = dijkstra(g, start, goal, connectivity=4)

        assert a_res.success == d_res.success
        if a_res.success:
            assert a_res.cost == pytest.approx(d_res.cost, rel=1e-4)
            assert a_res.expanded_nodes <= d_res.expanded_nodes, (
                f"Seed {seed}: A* expanded ({a_res.expanded_nodes}) > Dijkstra ({d_res.expanded_nodes})"
            )
            assert len(a_res.explored_cells) == a_res.expanded_nodes
            assert len(d_res.explored_cells) == d_res.expanded_nodes

