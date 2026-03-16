from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Coroutine
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from tornado.testing import AsyncHTTPTestCase

from api.auth.rate_limit import rate_limiter
from api.db import dispose_db
from api.main import create_app
from api.settings import clear_settings_cache


def _run_async(coro: Coroutine[Any, Any, object]) -> None:
    try:
        asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(coro)
        loop.close()


class TestTaskEndpoints(AsyncHTTPTestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory(prefix="scaffold-tasks-")
        self.db_path = Path(self.temp_dir.name) / "app.db"
        os.environ["APP_ENV"] = "test"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path}"
        os.environ["SESSION_SECRET"] = "test-session-secret"
        os.environ["LLM_PROVIDER"] = "mock"
        clear_settings_cache()
        rate_limiter.clear()
        _run_async(dispose_db())
        super().setUp()

    def tearDown(self) -> None:
        super().tearDown()
        clear_settings_cache()
        rate_limiter.clear()
        _run_async(dispose_db())
        self.temp_dir.cleanup()

    def get_app(self):  # type: ignore[no-untyped-def]
        return create_app()

    def test_scheduler_endpoint_starts_background_run_in_test(self) -> None:
        response = self.fetch(
            "/api/tasks/note-summary/run",
            method="POST",
            body=json.dumps({}),
        )

        assert response.code == 202
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["ok"] is True
        assert payload["task_run"]["status"] in {"queued", "running", "completed"}
