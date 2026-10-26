"""
grid.py - 2D Warehouse Grid Environment.

Purpose:
    Represents the physical 2D warehouse layout as an integer matrix, tracking traversable
    aisles, obstacle shelves, storage pickup bays, dropoff stations, and charging pads.

Role in the project:
    Core world representation. Shared across all path planners, the swarm coordinator,
    the simulation loop, and the frontend rendering canvas.

Key contents:
    - CellType: IntEnum of cell states (FREE=0, OBSTACLE=1, STORAGE=2, DROPOFF=3, CHARGING=4).
    - Grid: 2D NumPy array wrapper with bounds checking, neighbour expansion, and serialization.

Talks to:
    - app.planning.*: Queried for cell traversability and neighbour generation.
    - app.core.simulator.Simulator: Owns the active grid instance.
    - app.api.routes_map: Serializes grid to JSON for frontend canvas display.
"""

from __future__ import annotations
from enum import IntEnum
from typing import Iterator
import numpy as np


class CellType(IntEnum):
    """Numeric codes stored in the grid array."""
    FREE = 0        # walkable aisle
    OBSTACLE = 1    # wall, shelf, or dynamic obstacle
    STORAGE = 2     # pick-up shelf (walkable by robots)
    DROPOFF = 3     # packing / drop-off station
    CHARGING = 4    # optional charging pad


# Cells a robot can stand on (not solid walls)
TRAVERSABLE = {CellType.FREE, CellType.STORAGE, CellType.DROPOFF, CellType.CHARGING}

# 4-connected neighbour deltas (N, S, E, W)
DELTA_4 = [(-1, 0), (1, 0), (0, 1), (0, -1)]

# 8-connected adds diagonals
DELTA_8 = DELTA_4 + [(-1, -1), (-1, 1), (1, -1), (1, 1)]


class Grid:
    """
    A 2-D warehouse grid backed by a NumPy int8 array.

    Attributes:
        height (int): Number of rows.
        width  (int): Number of columns.
        cells  (np.ndarray): shape (height, width), dtype int8.

    Row-major indexing: cells[row, col]  ==  cells[y, x].
    """

    def __init__(self, height: int, width: int) -> None:
        if not (1 <= height <= 40 and 1 <= width <= 60):
            raise ValueError(f"Grid size {width}x{height} out of bounds (max 60x40).")
        self.height = height
        self.width = width
        # All cells start as FREE
        self.cells: np.ndarray = np.zeros((height, width), dtype=np.int8)

    # ------------------------------------------------------------------
    # Cell access helpers
    # ------------------------------------------------------------------

    def in_bounds(self, row: int, col: int) -> bool:
        """Return True if (row, col) is inside the grid."""
        return 0 <= row < self.height and 0 <= col < self.width

    def cell_type(self, row: int, col: int) -> CellType:
        """Return the CellType at (row, col)."""
        return CellType(int(self.cells[row, col]))

    def is_traversable(self, row: int, col: int) -> bool:
        """Return True if a robot may occupy this cell."""
        return self.in_bounds(row, col) and CellType(int(self.cells[row, col])) in TRAVERSABLE

    def set_cell(self, row: int, col: int, cell_type: CellType) -> None:
        """Set cell type; raises ValueError for out-of-bounds."""
        if not self.in_bounds(row, col):
            raise ValueError(f"Cell ({row},{col}) out of bounds.")
        self.cells[row, col] = int(cell_type)

    # ------------------------------------------------------------------
    # Neighbour enumeration (used by all planners)
    # ------------------------------------------------------------------

    def neighbours(
        self,
        row: int,
        col: int,
        connectivity: int = 4,
        check_diagonal_obstacles: bool = True,
    ) -> Iterator[tuple[int, int]]:
        """
        Yield (nr, nc) pairs for all valid, traversable neighbours.

        Args:
            row, col: Current cell.
            connectivity: 4 or 8.
            check_diagonal_obstacles: When True, a diagonal move is only
                allowed if *both* axial neighbours sharing the diagonal
                corner are also free (prevents corner-cutting through walls).
        """
        deltas = DELTA_4 if connectivity == 4 else DELTA_8
        for dr, dc in deltas:
            nr, nc = row + dr, col + dc
            if not self.is_traversable(nr, nc):
                continue
            if connectivity == 8 and abs(dr) == 1 and abs(dc) == 1 and check_diagonal_obstacles:
                # Both axial neighbours of the diagonal must be passable
                if not self.is_traversable(row, nc) or not self.is_traversable(nr, col):
                    continue
            yield nr, nc

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------

    def to_list(self) -> list[list[int]]:
        """Return the grid as a nested Python list (JSON-serialisable)."""
        return self.cells.tolist()

    def from_list(self, data: list[list[int]]) -> None:
        """Load grid contents from a nested list."""
        arr = np.array(data, dtype=np.int8)
        if arr.shape != (self.height, self.width):
            raise ValueError("Grid data shape mismatch.")
        self.cells = arr

    def clone(self) -> "Grid":
        """Return a deep copy."""
        g = Grid(self.height, self.width)
        g.cells = self.cells.copy()
        return g

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def find_cells(self, cell_type: CellType) -> list[tuple[int, int]]:
        """Return all (row, col) positions with the given cell type."""
        positions = np.argwhere(self.cells == int(cell_type))
        return [(int(r), int(c)) for r, c in positions]

    def __repr__(self) -> str:  # pragma: no cover
        return f"Grid({self.width}x{self.height})"
