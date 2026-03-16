from __future__ import annotations

import json

import tornado.web
from pydantic import BaseModel, EmailStr, ValidationError

from api.auth.flows import (
    AuthFlowError,
    login_with_dev_password,
    logout_session,
    start_login_challenge,
    verify_login_challenge,
)
from api.middleware import BaseAPIHandler
from api.settings import get_settings


class StartAuthRequest(BaseModel):
    email: EmailStr
    bot_token: str | None = None


class VerifyAuthRequest(BaseModel):
    email: EmailStr
    code: str


class PasswordAuthRequest(BaseModel):
    username: str
    password: str


def _parse_body(body: bytes) -> dict[str, object]:
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


class StartAuthHandler(BaseAPIHandler):
    async def post(self) -> None:
        try:
            payload = StartAuthRequest.model_validate(_parse_body(self.request.body))
            await start_login_challenge(
                email=str(payload.email),
                client_ip=self._extract_client_ip(),
                bot_token=payload.bot_token,
            )
            self.write_json(200, {"ok": True, "message": "Challenge code sent."})
        except ValidationError as exc:
            raise tornado.web.HTTPError(400, reason=exc.errors()[0]["msg"]) from exc
        except json.JSONDecodeError as exc:
            raise tornado.web.HTTPError(400, reason="Body must be valid JSON.") from exc
        except AuthFlowError as exc:
            raise tornado.web.HTTPError(exc.status_code, reason=str(exc)) from exc


class VerifyAuthHandler(BaseAPIHandler):
    async def post(self) -> None:
        settings = get_settings()
        try:
            payload = VerifyAuthRequest.model_validate(_parse_body(self.request.body))
            result = await verify_login_challenge(
                email=str(payload.email),
                code=payload.code,
                client_ip=self._extract_client_ip(),
            )
            self.set_cookie(
                settings.session_cookie_name,
                result.session_token,
                httponly=True,
                secure=settings.session_cookie_secure,
                samesite="lax",
                max_age=settings.session_ttl_minutes * 60,
                path="/",
            )
            self.write_json(200, {"ok": True, "email": result.user_email})
        except ValidationError as exc:
            raise tornado.web.HTTPError(400, reason=exc.errors()[0]["msg"]) from exc
        except json.JSONDecodeError as exc:
            raise tornado.web.HTTPError(400, reason="Body must be valid JSON.") from exc
        except AuthFlowError as exc:
            raise tornado.web.HTTPError(exc.status_code, reason=str(exc)) from exc


class LogoutAuthHandler(BaseAPIHandler):
    async def post(self) -> None:
        settings = get_settings()
        session_token = self.get_cookie(settings.session_cookie_name)
        if session_token:
            await logout_session(session_token=session_token)
        self.clear_cookie(settings.session_cookie_name, path="/")
        self.write_json(200, {"ok": True})


class PasswordLoginHandler(BaseAPIHandler):
    async def post(self) -> None:
        settings = get_settings()
        try:
            payload = PasswordAuthRequest.model_validate(_parse_body(self.request.body))
            result = await login_with_dev_password(
                username=payload.username,
                password=payload.password,
                client_ip=self._extract_client_ip(),
            )
            self.set_cookie(
                settings.session_cookie_name,
                result.session_token,
                httponly=True,
                secure=settings.session_cookie_secure,
                samesite="lax",
                max_age=settings.session_ttl_minutes * 60,
                path="/",
            )
            self.write_json(200, {"ok": True, "email": result.user_email})
        except ValidationError as exc:
            raise tornado.web.HTTPError(400, reason=exc.errors()[0]["msg"]) from exc
        except json.JSONDecodeError as exc:
            raise tornado.web.HTTPError(400, reason="Body must be valid JSON.") from exc
        except AuthFlowError as exc:
            raise tornado.web.HTTPError(exc.status_code, reason=str(exc)) from exc
