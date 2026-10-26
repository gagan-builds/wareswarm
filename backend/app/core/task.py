"""
task.py - Warehouse Task Model & Task Queue Management.

Purpose:
    Represents warehouse transport orders (moving items from storage pickup 'P'
    to delivery dropoff 'D') and manages the pending/active task queue.

Role in the project:
    The workload driver of the simulation. Created automatically by the task generator
    or manually via REST API, and consumed by the swarm task allocator.

Key contents:
    - TaskStatus: StrEnum of order lifecycle (PENDING, ASSIGNED, IN_FLIGHT, DONE, FAILED).
    - Task: Dataclass recording pickup/dropoff coordinates, timestamps, and assigned robot.
    - TaskQueue: Queue managing active, pending, and completed tasks.

Talks to:
    - app.swarm.task_allocator: Supplies pending tasks to idle robots.
    - app.core.simulator.Simulator: Owns the TaskQueue and auto-generates tasks.
    - app.core.metrics.MetricsCollector: Records task completion times and throughput.
"""

from __future__ import annotations
from enum import Enum
from dataclasses import dataclass, field
import time


class TaskStatus(str, Enum):
    PENDING   = "pending"     # waiting for a robot assignment
    ASSIGNED  = "assigned"    # robot heading to pickup
    IN_FLIGHT = "in_flight"   # robot carrying the load
    DONE      = "done"        # delivered to dropoff
    FAILED    = "failed"      # could not be completed


@dataclass
class Task:
    """
    Warehouse task: pickup → dropoff.

    Attributes:
        task_id:      Unique monotonic integer ID.
        pickup_row:   Row of the STORAGE cell.
        pickup_col:   Column of the STORAGE cell.
        dropoff_row:  Row of the DROPOFF cell.
        dropoff_col:  Column of the DROPOFF cell.
        status:       Current TaskStatus.
        assigned_robot_id: ID of the robot handling this task (or None).
        created_tick: Simulation tick at which the task was created.
        assigned_tick: Tick at which it was assigned (or None).
        completed_tick: Tick at which it was delivered (or None).
    """
    task_id: int
    pickup_row: int
    pickup_col: int
    dropoff_row: int
    dropoff_col: int
    status: TaskStatus = TaskStatus.PENDING
    assigned_robot_id: int | None = None
    created_tick: int = 0
    assigned_tick: int | None = None
    completed_tick: int | None = None

    @property
    def completion_time(self) -> int | None:
        """Ticks from creation to delivery, or None if not done."""
        if self.completed_tick is not None:
            return self.completed_tick - self.created_tick
        return None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "pickup": [self.pickup_row, self.pickup_col],
            "dropoff": [self.dropoff_row, self.dropoff_col],
            "status": self.status.value,
            "assigned_robot_id": self.assigned_robot_id,
            "created_tick": self.created_tick,
            "assigned_tick": self.assigned_tick,
            "completed_tick": self.completed_tick,
            "completion_time": self.completion_time,
        }


class TaskQueue:
    """Simple FIFO task queue with status filtering and priority insertion."""

    def __init__(self) -> None:
        self._tasks: dict[int, Task] = {}
        self._next_id: int = 1

    def create_task(
        self,
        pickup_row: int, pickup_col: int,
        dropoff_row: int, dropoff_col: int,
        created_tick: int = 0,
        priority: bool = False,
    ) -> Task:
        """Create and enqueue a new task, optionally at the head of the queue."""
        task = Task(
            task_id=self._next_id,
            pickup_row=pickup_row,
            pickup_col=pickup_col,
            dropoff_row=dropoff_row,
            dropoff_col=dropoff_col,
            created_tick=created_tick,
        )
        self._next_id += 1
        if priority:
            # Place at front of dictionary so pending allocation considers it first
            new_tasks = {task.task_id: task}
            new_tasks.update(self._tasks)
            self._tasks = new_tasks
        else:
            self._tasks[task.task_id] = task
        return task

    def prioritize_task(self, task_id: int) -> None:
        """Move an existing task to the front of the pending queue."""
        if task_id in self._tasks:
            task = self._tasks.pop(task_id)
            new_tasks = {task_id: task}
            new_tasks.update(self._tasks)
            self._tasks = new_tasks

    def get_pending(self) -> list[Task]:
        return [t for t in self._tasks.values() if t.status == TaskStatus.PENDING]

    def get_all(self) -> list[Task]:
        return list(self._tasks.values())

    def get_by_id(self, task_id: int) -> Task | None:
        return self._tasks.get(task_id)

    def clear(self) -> None:
        self._tasks.clear()
        self._next_id = 1
