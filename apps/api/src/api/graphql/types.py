from __future__ import annotations

from datetime import datetime

import strawberry
from pydantic import BaseModel, Field

from api.models import Note, TaskRun


@strawberry.type
class NoteType:
    id: str
    title: str
    body: str
    summary: str | None
    summary_provider: str | None
    summary_updated_at: str | None
    created_at: str


@strawberry.type
class CurrentUserType:
    id: str
    email: str


@strawberry.type
class ViewerType:
    email: str


@strawberry.type
class TaskRunType:
    id: str
    task_name: str
    status: str
    progress_current: int
    progress_total: int
    message: str | None
    error_message: str | None
    created_at: str
    updated_at: str
    finished_at: str | None


@strawberry.input
class CreateNoteInput:
    title: str
    body: str = ""


class CreateNoteInputModel(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)


def user_email_to_viewer_type(user_email: str) -> ViewerType:
    return ViewerType(email=user_email)


def note_to_type(note: Note) -> NoteType:
    created_at = note.created_at
    if isinstance(created_at, datetime):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = str(created_at)
    summary_updated_at = note.summary_updated_at
    if isinstance(summary_updated_at, datetime):
        summary_updated_at_str = summary_updated_at.isoformat()
    elif summary_updated_at is None:
        summary_updated_at_str = None
    else:
        summary_updated_at_str = str(summary_updated_at)
    return NoteType(
        id=note.id,
        title=note.title,
        body=note.body,
        summary=note.summary,
        summary_provider=note.summary_provider,
        summary_updated_at=summary_updated_at_str,
        created_at=created_at_str,
    )


def task_run_to_type(task_run: TaskRun) -> TaskRunType:
    def _serialize(value: datetime | None) -> str | None:
        if isinstance(value, datetime):
            return value.isoformat()
        if value is None:
            return None
        return str(value)

    return TaskRunType(
        id=task_run.id,
        task_name=task_run.task_name,
        status=task_run.status,
        progress_current=task_run.progress_current,
        progress_total=task_run.progress_total,
        message=task_run.message,
        error_message=task_run.error_message,
        created_at=_serialize(task_run.created_at) or "",
        updated_at=_serialize(task_run.updated_at) or "",
        finished_at=_serialize(task_run.finished_at),
    )
