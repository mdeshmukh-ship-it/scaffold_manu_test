from __future__ import annotations

from sqlalchemy import select

from api.db import operation
from api.llm.client import LLMRequest, generate_text
from api.models import Note, User, utcnow

from .base import TaskExecutionContext


def _build_note_summary_request(note: Note) -> LLMRequest:
    """Build a reusable note-summary request for the configured LLM provider"""
    return LLMRequest(
        system_prompt="You summarize personal notes for busy teammates in 1-2 sentences.",
        user_prompt=f"Title: {note.title}\nBody: {note.body}",
    )


async def summarize_note_for_user(*, note_id: str, user_email: str) -> Note:
    """Summarize a single note owned by the current user"""
    async with operation("notes.summarize.fetch") as op:
        user = (await op.session.execute(select(User).where(User.email == user_email))).scalar_one_or_none()
        if user is None:
            raise LookupError("User not found.")
        note = (
            await op.session.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
        ).scalar_one_or_none()
        if note is None:
            raise LookupError("Note not found.")
        llm_request = _build_note_summary_request(note)

    llm_response = await generate_text(op="notes.summarize", request=llm_request)
    return await _save_note_summary(
        note_id=note_id,
        summary=llm_response.text,
        summary_provider=llm_response.provider,
    )


async def summarize_notes_task(context: TaskExecutionContext, *, user_id: str | None) -> None:
    """Summarize notes in the background and persist task progress"""
    async with operation("notes.summary_task.fetch_ids") as op:
        stmt = select(Note.id).order_by(Note.created_at.desc())
        if user_id:
            stmt = stmt.where(Note.user_id == user_id)
        note_ids = list((await op.session.execute(stmt)).scalars())

    total = len(note_ids)
    await context.update_progress(
        progress_current=0,
        progress_total=total,
        message="Preparing note summaries",
    )

    for index, note_id in enumerate(note_ids, start=1):
        await summarize_note_by_id(note_id=note_id)
        await context.update_progress(
            progress_current=index,
            progress_total=total,
            message=f"Summarized {index} of {total} notes",
        )


async def summarize_note_by_id(*, note_id: str) -> Note:
    """Summarize a single note by id without user-level authorization checks"""
    async with operation("notes.summarize.fetch_by_id") as op:
        note = (await op.session.execute(select(Note).where(Note.id == note_id))).scalar_one_or_none()
        if note is None:
            raise LookupError("Note not found.")
        llm_request = _build_note_summary_request(note)

    llm_response = await generate_text(op="notes.summarize_background", request=llm_request)
    return await _save_note_summary(
        note_id=note_id,
        summary=llm_response.text,
        summary_provider=llm_response.provider,
    )


async def _save_note_summary(
    *,
    note_id: str,
    summary: str,
    summary_provider: str,
) -> Note:
    """Persist summary fields for a note and return the refreshed record"""
    async with operation("notes.summarize.save") as op:
        note = (await op.session.execute(select(Note).where(Note.id == note_id))).scalar_one()
        note.summary = summary
        note.summary_provider = summary_provider
        note.summary_updated_at = utcnow()
        await op.session.commit()
        await op.session.refresh(note)
        return note
