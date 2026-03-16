from __future__ import annotations

import hmac

import tornado.web
from pydantic import BaseModel

from api.audit import log_authz_decision
from api.middleware import BaseAPIHandler
from api.settings import get_settings
from api.tasks.base import spawn_tracked_task
from api.tasks.note_summary import summarize_notes_task


class TaskRunPayload(BaseModel):
    id: str
    task_name: str
    status: str
    progress_current: int
    progress_total: int
    message: str | None


class TaskRunResponse(BaseModel):
    ok: bool
    task_run: TaskRunPayload


def _allow_scheduler_request(handler: BaseAPIHandler) -> None:
    settings = get_settings()
    supplied_token = handler.request.headers.get("X-Scheduler-Token", "")

    if settings.scheduler_shared_token:
        if hmac.compare_digest(supplied_token, settings.scheduler_shared_token):
            log_authz_decision(
                action="tasks.note_summary.run",
                resource="scheduler.endpoint",
                allowed=True,
                reason="valid scheduler token",
            )
            return

        log_authz_decision(
            action="tasks.note_summary.run",
            resource="scheduler.endpoint",
            allowed=False,
            reason="invalid scheduler token",
        )
        raise tornado.web.HTTPError(403, reason="Invalid scheduler token.")

    if settings.app_env in {"local", "test"}:
        log_authz_decision(
            action="tasks.note_summary.run",
            resource="scheduler.endpoint",
            allowed=True,
            reason="local/test environment without scheduler token",
        )
        return

    log_authz_decision(
        action="tasks.note_summary.run",
        resource="scheduler.endpoint",
        allowed=False,
        reason="scheduler token missing in non-local environment",
    )
    raise tornado.web.HTTPError(403, reason="Scheduler token is required.")


class NoteSummaryRunHandler(BaseAPIHandler):
    async def post(self) -> None:
        _allow_scheduler_request(self)
        task_run = await spawn_tracked_task(
            task_name="notes.summary_run",
            user_id=None,
            message="Queued note summary run",
            task_callable=lambda context: summarize_notes_task(context, user_id=None),
        )
        response = TaskRunResponse(
            ok=True,
            task_run=TaskRunPayload(
                id=task_run.id,
                task_name=task_run.task_name,
                status=task_run.status,
                progress_current=task_run.progress_current,
                progress_total=task_run.progress_total,
                message=task_run.message,
            ),
        )
        self.write_json(202, response.model_dump())
