"""
conftest.py - Shared Pytest Fixtures & Test Environments.

Purpose:
    Supplies shared grid environments (small 5x5, open floor, congested warehouse)
    and test fixtures across all backend test suites.

Role in the project:
    Test configuration and fixture provider for pytest.

Key contents:
    - small_grid: 5x5 unobstructed test grid for rapid unit tests.
    - open_grid: 30x20 open floor layout fixture.
    - congested_grid: 30x20 congested corridor layout fixture.

Talks to:
    - pytest: Automatically loaded during test execution.
    - tests/test_planners.py & tests/test_swarm.py: Supplies test grid fixtures.
"""
import pytest
from app.core.grid import Grid, CellType
from app.core.map_generator import generate_congested, generate_open_floor


@pytest.fixture
def small_grid():
    """5x5 all-FREE grid for quick tests."""
    return Grid(5, 5)


@pytest.fixture
def open_grid():
    """30x20 open-floor preset."""
    return generate_open_floor(30, 20)


@pytest.fixture
def congested_grid():
    """30x20 congested preset."""
    return generate_congested(30, 20)


@pytest.fixture(autouse=True)
def enable_billing_enforcement(monkeypatch):
    """Enable billing and plan limits enforcement during pytest executions."""
    from app.config import settings
    monkeypatch.setattr(settings, "enforce_subscription_limits", True)
