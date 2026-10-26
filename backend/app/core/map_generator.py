"""
map_generator.py - Procedural Warehouse Layout & Preset Map Generator.

Purpose:
    Generates standardized and randomized warehouse grid environments (warehouse aisles,
    congested chokepoints, open floor, and seeded random obstacles).

Role in the project:
    Supplies the initial world layout for every simulation run, comparison benchmark,
    and Map Builder template starter.

Key contents:
    - generate_warehouse(): Classic parallel shelf layout with 3-cell highway aisles and cross-aisles.
    - generate_congested(): Bottlenecked layout designed to stress-test deadlock avoidance.
    - generate_open_floor(): Sparse obstacle layout for high-speed routing benchmarks.
    - generate_random(): Seeded procedural obstacle placement with open borders.
    - PRESETS & get_preset(): Registry mapping preset names to generator functions.

Talks to:
    - app.core.grid.Grid: Constructs and populates Grid instances.
    - app.core.simulator.Simulator: Called during world build and preset reset.
    - app.api.routes_map: Called by preset retrieval and apply endpoints.
"""

from __future__ import annotations
import random
from app.core.grid import CellType, Grid


# ---------------------------------------------------------------------------
# Preset helpers
# ---------------------------------------------------------------------------

def _place_shelf_row(grid: Grid, row: int, col_start: int, col_end: int) -> None:
    """Mark a horizontal stretch of cells as OBSTACLE (shelf face)."""
    for c in range(col_start, col_end + 1):
        grid.set_cell(row, c, CellType.OBSTACLE)


def _place_shelf_col(grid: Grid, col: int, row_start: int, row_end: int) -> None:
    """Mark a vertical stretch of cells as OBSTACLE."""
    for r in range(row_start, row_end + 1):
        grid.set_cell(r, col, CellType.OBSTACLE)


# ---------------------------------------------------------------------------
# Preset A – open floor
# ---------------------------------------------------------------------------

def generate_open_floor(width: int = 30, height: int = 20) -> Grid:
    """
    Open floor with a few scattered obstacle clusters, several STORAGE
    shelves along the top wall, and DROPOFF stations along the bottom.
    Easy routing – used to establish baseline performance.
    """
    grid = Grid(height, width)

    # Outer walls (optional; handled by bounds check – leave open)

    # Scattered internal obstacle islands
    obstacles = [
        (3, 5), (3, 6),
        (7, 10), (7, 11), (8, 10),
        (12, 4), (12, 5), (13, 4),
        (5, 20), (6, 20), (6, 21),
        (14, 25), (15, 25),
    ]
    for r, c in obstacles:
        if grid.in_bounds(r, c):
            grid.set_cell(r, c, CellType.OBSTACLE)

    # Storage shelves – top two rows (y=0..1), columns 2..width-3
    for c in range(2, width - 2, 4):
        if grid.in_bounds(0, c):
            grid.set_cell(0, c, CellType.STORAGE)
            if grid.in_bounds(0, c + 1):
                grid.set_cell(0, c + 1, CellType.STORAGE)

    # Dropoff stations – bottom row
    for c in range(2, width - 2, 5):
        if grid.in_bounds(height - 1, c):
            grid.set_cell(height - 1, c, CellType.DROPOFF)

    # Charging pads – corners
    for r, c in [(1, 1), (1, width - 2), (height - 2, 1), (height - 2, width - 2)]:
        if grid.in_bounds(r, c):
            grid.set_cell(r, c, CellType.CHARGING)

    return grid


# ---------------------------------------------------------------------------
# Preset B – classic warehouse
# ---------------------------------------------------------------------------

def generate_warehouse(width: int = 30, height: int = 20) -> Grid:
    """
    Classic warehouse with parallel shelf aisles.

    Layout:
      - Vertical shelf columns separated by 3-cell-wide aisles.
      - A horizontal cross-aisle near the middle.
      - STORAGE cells on each shelf column.
      - DROPOFF stations along the bottom wall.
    """
    grid = Grid(height, width)

    aisle_width = 3          # cells between shelf faces
    shelf_width = 2          # shelf block width
    top_margin = 2           # rows left clear at top for movement
    bottom_margin = 3        # rows left clear at bottom for dropoff
    cross_row = height // 2  # horizontal cross-aisle row (kept FREE)

    col = top_margin
    while col + shelf_width < width - 1:
        # Left face of shelf block = OBSTACLE, right face = STORAGE
        for r in range(top_margin, height - bottom_margin):
            if r == cross_row:
                continue  # leave cross-aisle open
            if grid.in_bounds(r, col):
                grid.set_cell(r, col, CellType.OBSTACLE)
            if grid.in_bounds(r, col + 1) and col + 1 < width - 1:
                grid.set_cell(r, col + 1, CellType.STORAGE)
        col += shelf_width + aisle_width

    # Dropoff row
    for c in range(0, width, 4):
        if grid.in_bounds(height - 1, c):
            grid.set_cell(height - 1, c, CellType.DROPOFF)

    # Charging pads
    for c in [1, width - 2]:
        if grid.in_bounds(0, c):
            grid.set_cell(0, c, CellType.CHARGING)

    return grid


# ---------------------------------------------------------------------------
# Preset C – congested
# ---------------------------------------------------------------------------

def generate_congested(width: int = 30, height: int = 20) -> Grid:
    """
    Congested layout with narrow corridors that force robots to interact.

    Features:
      - Horizontal shelf walls with single-cell-wide gaps (bottlenecks).
      - S-shaped corridor through the centre.
      - Multiple STORAGE and DROPOFF cells spread around the map.
      - Designed to produce frequent conflicts, deadlocks, and near-misses.
    """
    grid = Grid(height, width)

    # ----- Horizontal shelf walls with narrow gaps -----
    # Row 4: wall from col 0 to width-1, with gaps at col 5 and col width-5
    gap_pairs = [
        (4,  [5, width - 6]),
        (9,  [3, width // 2, width - 4]),
        (14, [width // 2 - 1, width // 2]),
    ]
    for row, gaps in gap_pairs:
        for c in range(0, width):
            if grid.in_bounds(row, c) and c not in gaps:
                grid.set_cell(row, c, CellType.OBSTACLE)

    # ----- Vertical dividers creating S-corridor -----
    for r in range(5, 9):
        if grid.in_bounds(r, width // 2):
            grid.set_cell(r, width // 2, CellType.OBSTACLE)
    for r in range(10, 14):
        if grid.in_bounds(r, width // 2 - 3):
            grid.set_cell(r, width // 2 - 3, CellType.OBSTACLE)

    # ----- Storage cells scattered around -----
    storage_positions = [
        (0, 2), (0, 6), (0, 10), (0, 14), (0, 18), (0, 22), (0, 26),
        (2, 0), (2, width - 1),
        (7, 2), (7, width - 3),
        (11, width // 2 + 2), (11, width // 2 - 5),
        (16, 3), (16, width - 4),
    ]
    for r, c in storage_positions:
        if grid.in_bounds(r, c) and grid.cell_type(r, c) == CellType.FREE:
            grid.set_cell(r, c, CellType.STORAGE)

    # ----- Dropoff stations -----
    for c in range(2, width - 1, 6):
        if grid.in_bounds(height - 1, c) and grid.cell_type(height - 1, c) == CellType.FREE:
            grid.set_cell(height - 1, c, CellType.DROPOFF)

    # Charging
    for r, c in [(1, 1), (1, width - 2), (height - 2, 1), (height - 2, width - 2)]:
        if grid.in_bounds(r, c) and grid.cell_type(r, c) == CellType.FREE:
            grid.set_cell(r, c, CellType.CHARGING)

    return grid


# ---------------------------------------------------------------------------
# Random generator
# ---------------------------------------------------------------------------

def generate_random(
    width: int = 30,
    height: int = 20,
    obstacle_density: float = 0.15,
    seed: int | None = None,
) -> Grid:
    """
    Random grid with given obstacle density and reproducible seed.

    Guarantees:
      - At least one STORAGE cell exists.
      - At least one DROPOFF cell exists.
      - Border cells stay FREE (so robots are never trapped at start).
    """
    rng = random.Random(seed)
    grid = Grid(height, width)

    for r in range(1, height - 1):
        for c in range(1, width - 1):
            if rng.random() < obstacle_density:
                grid.set_cell(r, c, CellType.OBSTACLE)

    # Ensure at least some STORAGE and DROPOFF cells
    storage_cols = list(range(2, width - 2, max(2, (width - 4) // 6)))
    for c in storage_cols:
        grid.set_cell(2, c, CellType.STORAGE)

    dropoff_cols = list(range(2, width - 2, max(2, (width - 4) // 5)))
    for c in dropoff_cols:
        grid.set_cell(height - 1, c, CellType.DROPOFF)

    return grid


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

PRESETS: dict[str, callable] = {
    "open_floor": generate_open_floor,
    "warehouse": generate_warehouse,
    "congested": generate_congested,
    "random": lambda w=30, h=20, seed=None: generate_random(w, h, obstacle_density=0.15, seed=seed),
}


def get_preset(name: str, width: int = 30, height: int = 20, seed: int | None = None) -> Grid:
    """Return a preset grid by name, or raise KeyError."""
    if name not in PRESETS:
        raise KeyError(f"Unknown preset '{name}'. Available: {list(PRESETS)}")
    fn = PRESETS[name]
    if name == "random":
        return fn(width, height, seed=seed)
    return fn(width, height)

