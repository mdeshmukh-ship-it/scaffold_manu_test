from __future__ import annotations

from typing import Any

import strawberry
from graphql import GraphQLError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.audit import AuthorizationError, require_authenticated_user_email
from api.db import operation
from api.models import Note, User
from api.tasks.base import get_task_run_for_user, list_task_runs_for_user, spawn_tracked_task
from api.tasks.note_summary import summarize_note_for_user, summarize_notes_task

from .types import (
    CreateNoteInput,
    CreateNoteInputModel,
    CurrentUserType,
    NoteType,
    TaskRunType,
    ViewerType,
    note_to_type,
    task_run_to_type,
    user_email_to_viewer_type,
)


def _require_user_email(info: strawberry.Info[Any, Any], *, action: str) -> str:
    try:
        return require_authenticated_user_email(
            info.context.get("user_email"),
            action=action,
            resource="note",
        )
    except AuthorizationError as exc:
        raise GraphQLError(str(exc)) from exc


async def _find_user_by_email(session: AsyncSession, user_email: str) -> User | None:
    return (await session.execute(select(User).where(User.email == user_email))).scalar_one_or_none()


@strawberry.type
class Query:
    @strawberry.field
    async def current_user(self, info: strawberry.Info[Any, Any]) -> CurrentUserType:
        user_email = _require_user_email(info, action="me.read")
        return CurrentUserType(id=user_email, email=user_email)

    @strawberry.field
    async def viewer(self, info: strawberry.Info[Any, Any]) -> ViewerType:
        user_email = _require_user_email(info, action="viewer.read")
        return user_email_to_viewer_type(user_email)

    @strawberry.field
    async def notes(self, info: strawberry.Info[Any, Any]) -> list[NoteType]:
        user_email = _require_user_email(info, action="notes.list")
        async with operation("notes.list") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                return []
            notes = (
                await op.session.execute(select(Note).where(Note.user_id == user.id).order_by(Note.created_at.desc()))
            ).scalars()
            return [note_to_type(note) for note in notes]

    @strawberry.field
    async def task_runs(self, info: strawberry.Info[Any, Any]) -> list[TaskRunType]:
        user_email = _require_user_email(info, action="tasks.list")
        async with operation("tasks.resolve_user") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                return []
        task_runs = await list_task_runs_for_user(user_id=user.id)
        return [task_run_to_type(task_run) for task_run in task_runs]

    @strawberry.field
    async def task_run(
        self,
        info: strawberry.Info[Any, Any],
        task_run_id: str,
    ) -> TaskRunType | None:
        user_email = _require_user_email(info, action="tasks.get")
        async with operation("tasks.resolve_user") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                return None
        task_run = await get_task_run_for_user(task_run_id=task_run_id, user_id=user.id)
        if task_run is None:
            return None
        return task_run_to_type(task_run)


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_note(
        self,
        info: strawberry.Info[Any, Any],
        input: CreateNoteInput,
    ) -> NoteType:
        user_email = _require_user_email(info, action="notes.create")
        try:
            payload = CreateNoteInputModel.model_validate({"title": input.title, "body": input.body})
        except ValidationError as exc:
            raise GraphQLError(exc.errors()[0]["msg"]) from exc

        async with operation("notes.create") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                user = User(email=user_email)
                op.session.add(user)
                await op.session.flush()

            note = Note(user_id=user.id, title=payload.title.strip(), body=payload.body.strip())
            op.session.add(note)
            await op.session.commit()
            await op.session.refresh(note)
            return note_to_type(note)

    @strawberry.mutation
    async def summarize_note(self, info: strawberry.Info[Any, Any], note_id: str) -> NoteType:
        user_email = _require_user_email(info, action="notes.summarize")
        try:
            note = await summarize_note_for_user(note_id=note_id, user_email=user_email)
        except LookupError as exc:
            raise GraphQLError(str(exc)) from exc
        return note_to_type(note)

    @strawberry.mutation
    async def start_note_summary_run(self, info: strawberry.Info[Any, Any]) -> TaskRunType:
        user_email = _require_user_email(info, action="tasks.start")
        async with operation("tasks.resolve_user") as op:
            user = await _find_user_by_email(op.session, user_email)
            if user is None:
                raise GraphQLError("User not found.")

        task_run = await spawn_tracked_task(
            task_name="notes.summary_run",
            user_id=user.id,
            message="Queued note summary run",
            task_callable=lambda context: summarize_notes_task(context, user_id=user.id),
        )
        return task_run_to_type(task_run)


schema = strawberry.Schema(query=Query, mutation=Mutation)
