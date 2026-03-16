from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from tornado.ioloop import IOLoop

from api.db import operation
from api.logging_config import get_logger
from api.models import TaskRun, utcnow

logger = get_logger(__name__)

TASK_STATUS_QUEUED = "queued"
TASK_STATUS_RUNNING = "running"
TASK_STATUS_COMPLETED = "completed"
TASK_STATUS_FAILED = "failed"
INTERRUPTED_TASK_MESSAGE = "Task interrupted by process restart."

TaskCallable = Callable[["TaskExecutionContext"], Awaitable[None]]


@dataclass
class TaskExecutionContext:
    task_run_id: str
    task_name: str

    async def mark_running(self, *, message: str | None = None) -> None:
        """Mark the task as actively running"""
        await self._update(status=TASK_STATUS_RUNNING, message=message)

    async def update_progress(
        self,
        *,
        progress_current: int,
        progress_total: int | None = None,
        message: str | None = None,
    ) -> None:
        """Update task progress counters and optional status message"""
        await self._update(
            progress_current=progress_current,
            progress_total=progress_total,
            message=message,
        )

    async def mark_completed(self, *, message: str | None = None) -> None:
        """Mark the task as completed"""
        await self._update(
            status=TASK_STATUS_COMPLETED,
            message=message,
            finished_at=utcnow(),
            set_finished_at=True,
        )

    async def mark_failed(self, *, error_message: str) -> None:
        """Mark the task as failed and store a short error message"""
        await self._update(
            status=TASK_STATUS_FAILED,
            error_message=error_message[:256],
            finished_at=utcnow(),
            set_finished_at=True,
        )

    async def _update(
        self,
        *,
        status: str | None = None,
        progress_current: int | None = None,
        progress_total: int | None = None,
        message: str | None = None,
        error_message: str | None = None,
        finished_at: datetime | None = None,
        set_finished_at: bool = False,
    ) -> None:
        """Persist task status updates"""
        async with operation("tasks.update") as op:
            task_run = (await op.session.execute(select(TaskRun).where(TaskRun.id == self.task_run_id))).scalar_one()
            if status is not None:
                task_run.status = status
            if progress_current is not None:
                task_run.progress_current = progress_current
            if progress_total is not None:
                task_run.progress_total = progress_total
            if message is not None:
                task_run.message = message
            if error_message is not None:
                task_run.error_message = error_message
            if set_finished_at:
                task_run.finished_at = finished_at
            task_run.updated_at = utcnow()
            await op.session.commit()


async def create_task_run(
    *,
    task_name: str,
    user_id: str | None,
    message: str | None = None,
    progress_total: int = 0,
) -> TaskRun:
    """Create a new tracked background task run"""
    async with operation("tasks.create") as op:
        task_run = TaskRun(
            task_name=task_name,
            status=TASK_STATUS_QUEUED,
            user_id=user_id,
            progress_current=0,
            progress_total=progress_total,
            message=message,
        )
        op.session.add(task_run)
        await op.session.commit()
        await op.session.refresh(task_run)
        return task_run


async def spawn_tracked_task(
    *,
    task_name: str,
    user_id: str | None,
    message: str | None,
    task_callable: TaskCallable,
) -> TaskRun:
    """Create a task row and schedule its execution on the Tornado IOLoop"""
    task_run = await create_task_run(task_name=task_name, user_id=user_id, message=message)
    IOLoop.current().spawn_callback(_run_task, task_run.id, task_name, task_callable)
    return task_run


async def recover_abandoned_task_runs() -> int:
    """Mark queued or running in-process tasks as failed after a restart"""
    async with operation("tasks.recover_abandoned") as op:
        task_runs = list(
            (
                await op.session.execute(
                    select(TaskRun).where(TaskRun.status.in_((TASK_STATUS_QUEUED, TASK_STATUS_RUNNING)))
                )
            ).scalars()
        )
        if not task_runs:
            return 0

        finished_at = utcnow()
        for task_run in task_runs:
            task_run.status = TASK_STATUS_FAILED
            task_run.message = INTERRUPTED_TASK_MESSAGE
            task_run.error_message = INTERRUPTED_TASK_MESSAGE
            task_run.finished_at = finished_at
            task_run.updated_at = finished_at
        await op.session.commit()

    logger.warning(
        "recovered abandoned task runs",
        event_type="app.event",
        severity="WARNING",
        recovered_task_runs=len(task_runs),
    )
    return len(task_runs)


async def _run_task(task_run_id: str, task_name: str, task_callable: TaskCallable) -> None:
    """Execute a tracked task and persist the final outcome"""
    context = TaskExecutionContext(task_run_id=task_run_id, task_name=task_name)
    await context.mark_running(message="Task started")
    try:
        await task_callable(context)
        await context.mark_completed(message="Task completed")
    except Exception as exc:
        logger.exception(
            "background task failed",
            event_type="app.event",
            severity="ERROR",
            op=task_name,
            error_type=exc.__class__.__name__,
            error_message=str(exc)[:256],
        )
        await context.mark_failed(error_message=str(exc))


async def get_task_run_for_user(*, task_run_id: str, user_id: str) -> TaskRun | None:
    """Fetch a task run for the current user"""
    async with operation("tasks.get") as op:
        return (
            await op.session.execute(select(TaskRun).where(TaskRun.id == task_run_id, TaskRun.user_id == user_id))
        ).scalar_one_or_none()


async def list_task_runs_for_user(*, user_id: str, limit: int = 10) -> list[TaskRun]:
    """List recent task runs for the current user"""
    async with operation("tasks.list") as op:
        return list(
            (
                await op.session.execute(
                    select(TaskRun).where(TaskRun.user_id == user_id).order_by(TaskRun.created_at.desc()).limit(limit)
                )
            ).scalars()
        )
