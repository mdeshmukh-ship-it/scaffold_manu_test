from __future__ import annotations

import asyncio
import json
import os
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


class TestAuthFlow(AsyncHTTPTestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory(prefix="scaffold-auth-")
        self.db_path = Path(self.temp_dir.name) / "app.db"
        os.environ["APP_ENV"] = "test"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path}"
        os.environ["SESSION_SECRET"] = "test-session-secret"
        os.environ["AUTH_ALLOWED_EMAIL_DOMAINS"] = "example.com"
        os.environ["AUTH_PROVIDER"] = "console"
        os.environ["DEV_PASSWORD_LOGIN_ENABLED"] = "true"
        os.environ["DEV_PASSWORD_LOGIN_USERNAME"] = "admin"
        os.environ["DEV_PASSWORD_LOGIN_PASSWORD"] = "local-dev-password"
        os.environ["DEV_PASSWORD_LOGIN_EMAIL"] = "admin@example.com"
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

    def test_start_verify_and_me(self) -> None:
        start_response = self.fetch(
            "/api/auth/start",
            method="POST",
            body=json.dumps({"email": "builder@example.com"}),
        )
        assert start_response.code == 200

        code = peek_code_for_test("builder@example.com")
        assert code is not None

        verify_response = self.fetch(
            "/api/auth/verify",
            method="POST",
            body=json.dumps({"email": "builder@example.com", "code": code}),
        )
        assert verify_response.code == 200
        session_cookie = verify_response.headers.get("Set-Cookie")
        assert session_cookie is not None

        me_response = self.fetch(
            "/api/me",
            method="GET",
            headers={"Cookie": session_cookie.split(";", maxsplit=1)[0]},
        )
        assert me_response.code == 200
        payload = json.loads(me_response.body.decode("utf-8"))
        assert payload["email"] == "builder@example.com"

    def test_password_login_for_development(self) -> None:
        login_response = self.fetch(
            "/api/auth/password-login",
            method="POST",
            body=json.dumps(
                {
                    "username": "admin",
                    "password": "local-dev-password",
                }
            ),
        )
        assert login_response.code == 200
        cookie_header = login_response.headers.get("Set-Cookie")
        assert cookie_header is not None

        me_response = self.fetch(
            "/api/me",
            method="GET",
            headers={"Cookie": cookie_header.split(";", maxsplit=1)[0]},
        )
        assert me_response.code == 200
        payload = json.loads(me_response.body.decode("utf-8"))
        assert payload["email"] == "admin@example.com"


class TestPasswordLoginProdDenied(AsyncHTTPTestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory(prefix="scaffold-auth-prod-")
        self.db_path = Path(self.temp_dir.name) / "app.db"
        os.environ["APP_ENV"] = "prod"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path}"
        os.environ["SESSION_SECRET"] = "test-session-secret"
        os.environ["AUTH_ALLOWED_EMAIL_DOMAINS"] = "example.com"
        os.environ["DEV_PASSWORD_LOGIN_ENABLED"] = "true"
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

    def test_password_login_is_denied_outside_local_and_test(self) -> None:
        response = self.fetch(
            "/api/auth/password-login",
            method="POST",
            body=json.dumps(
                {
                    "username": "admin",
                    "password": "local-dev-password",
                }
            ),
        )
        assert response.code == 403
