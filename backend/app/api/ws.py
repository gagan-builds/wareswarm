"""
ws.py - Real-Time WebSocket Streaming Endpoint.

Purpose:
    Manages WebSocket connections and broadcasts authoritative simulation
    state snapshots (robots, grid, tasks, metrics, events) to frontend clients each tick.

Role in the project:
    The live communication pipeline connecting the Python simulation engine
    to the Next.js React user interface.

Key contents:
    - _connections: Set of active WebSocket client connections.
    - broadcast(): Async function transmitting serialized state dicts to all clients.
    - websocket_endpoint(): Route handler (/ws/sim) managing client connect/disconnect lifecycles.

Talks to:
    - app.core.simulator.Simulator: simulator.set_broadcast(broadcast) registers this sender.
    - frontend/lib/useSimWebSocket.ts: The React client hook connecting to /ws/sim.
"""

from __future__ import annotations
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.simulator import simulator

router = APIRouter()

# Set of all active WebSocket connections
_connections: set[WebSocket] = set()


async def broadcast(state: dict) -> None:
    """Send *state* to all connected WebSocket clients."""
    if not _connections:
        return
    message = json.dumps(state)
    dead: set[WebSocket] = set()
    for ws in list(_connections):
        try:
            await ws.send_text(message)
        except Exception:
            dead.add(ws)
    _connections.difference_update(dead)


# Register the broadcast function with the simulator
simulator.set_broadcast(broadcast)


@router.websocket("/ws/sim")
async def ws_sim(websocket: WebSocket) -> None:
    """
    WebSocket endpoint – streams simulation state each tick.

    On connect, sends the current state immediately so the frontend can
    render without waiting for the next tick.
    """
    await websocket.accept()
    _connections.add(websocket)
    try:
        # Send immediate snapshot
        await websocket.send_text(json.dumps(simulator.get_state()))
        # Keep connection alive; client sends nothing but we must receive
        # to detect disconnect
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send ping-like keepalive
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    finally:
        _connections.discard(websocket)
