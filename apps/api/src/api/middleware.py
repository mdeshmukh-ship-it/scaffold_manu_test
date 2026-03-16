from __future__ import annotations

import json
import time
from typing import Any
from uuid import uuid4

import tornado.web

from api.logging_config import (
    clear_request_context,
    get_logger,
    set_request_context,
    set_user_email,
)
from api.settings import get_settings

logger = get_logger(__name__)


class BaseAPIHandler(tornado.web.RequestHandler):
    request_started_at: float
    current_user_email: str | None
    request_id: str

    def set_default_headers(self) -> None:
        self.set_header("Content-Type", "application/json")

    def _extract_client_ip(self) -> str | None:
        return self.request.remote_ip

    async def prepare(self) -> None:
        settings = get_settings()
        self.request_started_at = time.perf_counter()
        self.request_id = str(uuid4())
        self.current_user_email = None

        set_request_context(
            request_id=self.request_id,
            user_email=None,
            severity_level=settings.effective_severity_level,
            client_ip=self._extract_client_ip(),
        )
        self.set_header("X-Request-Id", self.request_id)
        await self.load_current_user()

    def on_finish(self) -> None:
        duration_ms = round((time.perf_counter() - self.request_started_at) * 1000, 3)
        severity = "INFO"
        if self.get_status() >= 500:
            severity = "ERROR"
        elif self.get_status() >= 400:
            severity = "WARNING"

        logger.info(
            "request completed",
            event_type="http.request",
            severity=severity,
            method=self.request.method,
            path=self.request.path,
            status=self.get_status(),
            duration_ms=duration_ms,
            ok=self.get_status() < 400,
        )
        clear_request_context()

    def write_json(self, status_code: int, payload: dict[str, Any]) -> None:
        self.set_status(status_code)
        self.finish(json.dumps(payload))

    def write_error(self, status_code: int, **kwargs: Any) -> None:
        message = "Internal server error." if status_code >= 500 else self._reason
        payload = {"error": {"message": message}, "request_id": self.request_id}
        self.set_header("Content-Type", "application/json")
        self.finish(json.dumps(payload))

    async def load_current_user(self) -> None:
        settings = get_settings()
        session_token = self.get_cookie(settings.session_cookie_name)
        if not session_token:
            return

        from api.auth.flows import resolve_user_from_session_token

        self.current_user_email = await resolve_user_from_session_token(session_token)
        set_user_email(self.current_user_email)
