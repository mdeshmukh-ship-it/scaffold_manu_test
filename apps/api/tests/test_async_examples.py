from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
import pytest
from sqlalchemy import select

from api.db import init_db, operation
from api.llm.client import LLMRequest, generate_text
from api.models import TaskRun
from api.settings import clear_settings_cache
from api.tasks.base import (
    INTERRUPTED_TASK_MESSAGE,
    TASK_STATUS_FAILED,
    TASK_STATUS_RUNNING,
    create_task_run,
    recover_abandoned_task_runs,
)


@pytest.mark.asyncio
async def test_mock_llm_example() -> None:
    os.environ["LLM_PROVIDER"] = "mock"
    clear_settings_cache()

    response = await generate_text(
        op="notes.summarize",
        request=LLMRequest(
            system_prompt="You summarize notes.",
            user_prompt="Title: Demo note\nBody: This is a short note body for testing.",
        ),
    )

    assert response.provider == "mock"
    assert "Summary:" in response.text


@pytest.mark.asyncio
async def test_openai_llm_uses_outbound_wrapper(monkeypatch: pytest.MonkeyPatch) -> None:
    os.environ["LLM_PROVIDER"] = "openai"
    os.environ["OPENAI_API_KEY"] = "sk-test-key-12345678901234567890"
    os.environ["LLM_MODEL"] = "gpt-4o-mini"
    clear_settings_cache()

    recorded_calls: list[dict[str, object]] = []

    async def fake_outbound_request(**kwargs: object) -> httpx.Response:
        recorded_calls.append(dict(kwargs))
        return httpx.Response(
            status_code=200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "Summarized from OpenAI",
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr("api.llm.client.outbound_request", fake_outbound_request)

    response = await generate_text(
        op="notes.summarize",
        request=LLMRequest(
            system_prompt="You summarize notes.",
            user_prompt="Title: Demo note\nBody: This is a short note body for testing.",
        ),
    )

    assert response.provider == "openai"
    assert response.text == "Summarized from OpenAI"
    assert recorded_calls
    assert recorded_calls[0]["op"] == "llm.openai.notes.summarize"


@pytest.mark.asyncio
async def test_local_qwen_uses_local_runtime_wrapper(monkeypatch: pytest.MonkeyPatch) -> None:
    os.environ["LLM_PROVIDER"] = "local_qwen"
    os.environ["LLM_MODEL"] = "Qwen/Qwen3.5-2B"
    os.environ["LLM_LOCAL_BASE_URL"] = "http://127.0.0.1:8002"
    clear_settings_cache()

    recorded_calls: list[dict[str, object]] = []

    async def fake_outbound_request(**kwargs: object) -> httpx.Response:
        recorded_calls.append(dict(kwargs))
        return httpx.Response(
            status_code=200,
            json={
                "text": "Summarized from local Qwen",
                "provider": "local_qwen",
                "model": "Qwen/Qwen3.5-2B",
            },
        )

    monkeypatch.setattr("api.llm.client.outbound_request", fake_outbound_request)

    response = await generate_text(
        op="notes.summarize",
        request=LLMRequest(
            system_prompt="You summarize notes.",
            user_prompt="Title: Demo note\nBody: This is a short note body for testing.",
        ),
    )

    assert response.provider == "local_qwen"
    assert response.text == "Summarized from local Qwen"
    assert recorded_calls
    assert recorded_calls[0]["op"] == "llm.local_qwen.notes.summarize"
    assert recorded_calls[0]["url"] == "http://127.0.0.1:8002/generate"
    assert recorded_calls[0]["log_payload"] is False
    assert recorded_calls[0]["json"] == {
        "max_output_tokens": 400,
        "model": "Qwen/Qwen3.5-2B",
        "system_prompt": "You summarize notes.",
        "temperature": 0.2,
        "user_prompt": "Title: Demo note\nBody: This is a short note body for testing.",
    }


@pytest.mark.asyncio
async def test_recover_abandoned_task_runs_marks_incomplete_rows_failed() -> None:
    with TemporaryDirectory(prefix="scaffold-task-recovery-") as temp_dir:
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(temp_dir) / 'app.db'}"
        clear_settings_cache()
        init_db()

        queued = await create_task_run(task_name="queued-demo", user_id=None)
        running = await create_task_run(task_name="running-demo", user_id=None)

        async with operation("tasks.test_mark_running") as op:
            task_run = (await op.session.execute(select(TaskRun).where(TaskRun.id == running.id))).scalar_one()
            task_run.status = TASK_STATUS_RUNNING
            await op.session.commit()

        recovered = await recover_abandoned_task_runs()

        async with operation("tasks.test_read_recovered") as op:
            task_runs = list(
                (await op.session.execute(select(TaskRun).where(TaskRun.id.in_((queued.id, running.id))))).scalars()
            )

    assert recovered == 2
    for task_run in task_runs:
        assert task_run.status == TASK_STATUS_FAILED
        assert task_run.message == INTERRUPTED_TASK_MESSAGE
        assert task_run.error_message == INTERRUPTED_TASK_MESSAGE
        assert task_run.finished_at is not None
