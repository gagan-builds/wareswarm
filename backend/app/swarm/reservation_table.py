"""
reservation_table.py - Space-Time Reservation Table.

Purpose:
    Maintains a schedule of future cell occupancies and transitions, allowing robots
    to book space-time slots along their route and prevent overlaps.

Role in the project:
    Core data structure of the swarm coordination layer. Consulted and populated
    every tick by the SwarmCoordinator and Space-Time A* planner.

Key contents:
    - ReservationTable: Dict-backed registry for vertex and edge reservations.
    - reserve_path(): Registers a robot's scheduled trajectory into future time slots.
    - check_vertex(): Tests if a specific (row, col, tick) is already booked.
    - check_edge(): Tests if an opposing (swap) move occurs at the same transition.

Talks to:
    - app.swarm.coordinator.SwarmCoordinator: Populates reservations in priority order.
    - app.planning.space_time_astar: Queries table to treat reserved slots as obstacles.

Algorithm Details:
    - Idea: Discretized reservation table. Every planned step occupies a vertex (row, col, t)
      and an edge transition (r1, c1, r2, c2, t). Before advancing, robots verify that their
      next cell and corridor transition are completely unoccupied.
    - Time Complexity: O(1) average lookup/insert via Python dictionaries; O(L) to reserve
      a path of length L steps.
    - Project Objective: Primary collision avoidance mechanism ensuring 0 collisions in SWARM mode.
"""

from __future__ import annotations
from collections import defaultdict


class ReservationTable:
    """
    Thread-unsafe (single asyncio task only) space-time reservation table.

    Attributes:
        vertex: (row, col, t) → robot_id
        edge:   (r1,c1,r2,c2,t) → robot_id  (r1,c1 is origin, r2,c2 destination)
    """

    def __init__(self) -> None:
        self.vertex: dict[tuple[int, int, int], int] = {}
        self.edge: dict[tuple[int, int, int, int, int], int] = {}

    def clear(self) -> None:
        """Remove all reservations."""
        self.vertex.clear()
        self.edge.clear()

    def reserve_path(
        self,
        robot_id: int,
        path: list[tuple[int, int]],
        current_pos: tuple[int, int],
        start_tick: int,
    ) -> None:
        """
        Register every (cell, time) pair along a robot's planned path.

        Args:
            robot_id:    The robot's unique identifier.
            path:        List of (row, col) cells the robot will visit.
            current_pos: Robot's position at start_tick.
            start_tick:  The simulation tick corresponding to path[0].
        """
        # Reserve current position at current tick
        self.vertex[(current_pos[0], current_pos[1], start_tick)] = robot_id

        prev_r, prev_c = current_pos
        for i, (r, c) in enumerate(path):
            t = start_tick + i + 1
            self.vertex[(r, c, t)] = robot_id
            # Edge reservation: direction matters for swap detection
            self.edge[(prev_r, prev_c, r, c, t - 1)] = robot_id
            prev_r, prev_c = r, c

    def release_robot(self, robot_id: int) -> None:
        """Remove all reservations for *robot_id*."""
        self.vertex = {k: v for k, v in self.vertex.items() if v != robot_id}
        self.edge   = {k: v for k, v in self.edge.items()   if v != robot_id}

    def has_vertex_conflict(self, row: int, col: int, t: int, robot_id: int) -> bool:
        """Return True if (row, col, t) is reserved by a *different* robot."""
        owner = self.vertex.get((row, col, t))
        return owner is not None and owner != robot_id

    def has_edge_conflict(
        self, r1: int, c1: int, r2: int, c2: int, t: int, robot_id: int
    ) -> bool:
        """
        Return True if the reverse edge (r2,c2)→(r1,c1) at time t is
        reserved (swap conflict).
        """
        owner = self.edge.get((r2, c2, r1, c1, t))
        return owner is not None and owner != robot_id

    def get_vertex_reservations(self) -> set[tuple[int, int, int]]:
        """Return the full set of reserved (row, col, t) triples."""
        return set(self.vertex.keys())

    def get_edge_reservations(self) -> set[tuple[int, int, int, int, int]]:
        """Return the full set of reserved edges."""
        return set(self.edge.keys())

    def snapshot(self) -> dict:
        """JSON-serialisable snapshot (for debugging/logging)."""
        return {
            "vertex_count": len(self.vertex),
            "edge_count": len(self.edge),
        }
