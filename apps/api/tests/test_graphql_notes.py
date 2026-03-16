from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import Coroutine
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from tornado.testing import AsyncHTTPTestCase

from api.auth.providers import peek_code_for_test
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


class TestGraphQLNotes(AsyncHTTPTestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory(prefix="scaffold-graphql-")
        self.db_path = Path(self.temp_dir.name) / "app.db"
        os.environ["APP_ENV"] = "test"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path}"
        os.environ["SESSION_SECRET"] = "test-session-secret"
        os.environ["AUTH_ALLOWED_EMAIL_DOMAINS"] = "example.com"
        os.environ["AUTH_PROVIDER"] = "console"
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

    def _authenticate(self, email: str) -> str:
        start_response = self.fetch(
            "/api/auth/start",
            method="POST",
            body=json.dumps({"email": email}),
        )
        assert start_response.code == 200
        code = peek_code_for_test(email)
        assert code is not None
        verify_response = self.fetch(
            "/api/auth/verify",
            method="POST",
            body=json.dumps({"email": email, "code": code}),
        )
        assert verify_response.code == 200
        cookie_header = verify_response.headers.get("Set-Cookie")
        assert cookie_header is not None
        return cookie_header.split(";", maxsplit=1)[0]

    def test_create_and_list_notes(self) -> None:
        cookie = self._authenticate("builder@example.com")

        create_response = self.fetch(
            "/graphql",
            method="POST",
            headers={"Cookie": cookie},
            body=json.dumps(
                {
                    "query": (
                        "mutation CreateNote($input: CreateNoteInput!) { createNote(input: $input) { id title body } }"
                    ),
                    "variables": {"input": {"title": "First", "body": "Body"}},
                }
            ),
        )
        assert create_response.code == 200
        create_payload = json.loads(create_response.body.decode("utf-8"))
        assert create_payload["data"]["createNote"]["title"] == "First"

        list_response = self.fetch(
            "/graphql",
            method="POST",
            headers={"Cookie": cookie},
            body=json.dumps({"query": "query { viewer { email } notes { id title body } }"}),
        )
        assert list_response.code == 200
        list_payload = json.loads(list_response.body.decode("utf-8"))
        assert list_payload["data"]["viewer"]["email"] == "builder@example.com"
        assert len(list_payload["data"]["notes"]) == 1
        assert list_payload["data"]["notes"][0]["title"] == "First"

    def test_create_note_validation_error(self) -> None:
        cookie = self._authenticate("builder@example.com")

        response = self.fetch(
            "/graphql",
            method="POST",
            headers={"Cookie": cookie},
            body=json.dumps(
                {
                    "query": (
                        "mutation CreateNote($input: CreateNoteInput!) { createNote(input: $input) { id title } }"
                    ),
                    "variables": {"input": {"title": "", "body": "Body"}},
                }
            ),
        )

        assert response.code == 200
        payload = json.loads(response.body.decode("utf-8"))
        assert "errors" in payload
        assert "at least 1 character" in payload["errors"][0]["message"]

    def test_unauthenticated_graphql_cannot_spoof_introspection_operation_name(self) -> None:
        response = self.fetch(
            "/graphql",
            method="POST",
            body=json.dumps(
                {
                    "operationName": "IntrospectionQuery",
                    "query": ("query IntrospectionQuery { __schema { queryType { name } } notes { id } }"),
                }
            ),
        )

        assert response.code == 401

    def test_unauthenticated_introspection_is_allowed_in_test(self) -> None:
        response = self.fetch(
            "/graphql",
            method="POST",
            body=json.dumps(
                {
                    "operationName": "SchemaCheck",
                    "query": "query SchemaCheck { __schema { queryType { name } } }",
                }
            ),
        )

        assert response.code == 200
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["data"]["__schema"]["queryType"]["name"] == "Query"

    def test_summarize_note_and_background_run(self) -> None:
        cookie = self._authenticate("builder@example.com")

        create_response = self.fetch(
            "/graphql",
            method="POST",
            headers={"Cookie": cookie},
            body=json.dumps(
                {
                    "query": (
                        "mutation CreateNote($input: CreateNoteInput!) { createNote(input: $input) { id title } }"
                    ),
                    "variables": {"input": {"title": "First", "body": "This is a detailed note body."}},
                }
            ),
        )
        create_payload = json.loads(create_response.body.decode("utf-8"))
        note_id = create_payload["data"]["createNote"]["id"]

        summarize_response = self.fetch(
            "/graphql",
            method="POST",
            headers={"Cookie": cookie},
            body=json.dumps(
                {
                    "query": (
                        "mutation SummarizeNote($noteId: String!) { "
                        "summarizeNote(noteId: $noteId) { id summary summaryProvider } "
                        "}"
                    ),
                    "variables": {"noteId": note_id},
                }
            ),
        )
        summarize_payload = json.loads(summarize_response.body.decode("utf-8"))
        assert summarize_payload["data"]["summarizeNote"]["summary"].startswith("Summary:")
        assert summarize_payload["data"]["summarizeNote"]["summaryProvider"] == "mock"

        run_response = self.fetch(
            "/graphql",
            method="POST",
            headers={"Cookie": cookie},
            body=json.dumps(
                {
                    "query": (
                        "mutation StartRun { startNoteSummaryRun { id status progressCurrent progressTotal taskName } }"
                    )
                }
            ),
        )
        run_payload = json.loads(run_response.body.decode("utf-8"))
        task_run_id = run_payload["data"]["startNoteSummaryRun"]["id"]

        final_status = ""
        for _ in range(20):
            task_response = self.fetch(
                "/graphql",
                method="POST",
                headers={"Cookie": cookie},
                body=json.dumps(
                    {
                        "query": (
                            "query TaskRun($taskRunId: String!) { "
                            "taskRun(taskRunId: $taskRunId) { id status progressCurrent progressTotal } "
                            "}"
                        ),
                        "variables": {"taskRunId": task_run_id},
                    }
                ),
            )
            task_payload = json.loads(task_response.body.decode("utf-8"))
            final_status = task_payload["data"]["taskRun"]["status"]
            if final_status == "completed":
                break
            time.sleep(0.05)

        assert final_status == "completed"
