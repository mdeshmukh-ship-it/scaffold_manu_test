"""REST endpoint to trigger a monitoring run (for cron/scheduler use)."""

from __future__ import annotations

from api.middleware import BaseAPIHandler
from api.tasks.base import spawn_tracked_task
from api.tasks.monitoring_run import run_monitoring


class MonitoringRunHandler(BaseAPIHandler):
    """POST /api/monitoring/run — trigger a monitoring run."""

    async def post(self) -> None:
        if not self.current_user_email:
            self.write_json(401, {"error": {"message": "Unauthorized"}})
            return

        task_run = await spawn_tracked_task(
            task_name="monitoring.daily_run",
            user_id=None,
            message="Triggered monitoring run",
            task_callable=run_monitoring,
        )

        self.write_json(200, {
            "task_run_id": task_run.id,
            "status": task_run.status,
            "message": "Monitoring run started",
        })
