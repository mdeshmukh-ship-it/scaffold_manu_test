from __future__ import annotations

import hashlib
import hmac
import secrets
import string
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import Select, delete, select

from api.db import DBOperation, operation
from api.logging_config import get_logger
from api.models import AuthLoginCode, AuthSession, User
from api.outbound_http import request as outbound_request
from api.settings import get_settings

from .providers import get_challenge_provider
from .rate_limit import rate_limiter

logger = get_logger(__name__)


class AuthFlowError(Exception):
    status_code = 400


class RateLimitExceeded(AuthFlowError):
    status_code = 429


class ForbiddenEmail(AuthFlowError):
    status_code = 403


class ForbiddenAuthMethod(AuthFlowError):
    status_code = 403


class InvalidChallengeCode(AuthFlowError):
    status_code = 401


@dataclass
class AuthSessionResult:
    session_token: str
    user_email: str


def _utc_now() -> datetime:
    return datetime.now(tz=UTC)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _hash_with_secret(value: str, secret: str) -> str:
    return hashlib.sha256(f"{secret}:{value}".encode()).hexdigest()


def _make_challenge_code(length: int) -> str:
    alphabet = string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _check_rate_limit(
    *,
    key: str,
    max_requests: int,
    window_seconds: int,
    block_seconds: int = 0,
    action: str,
) -> None:
    decision = rate_limiter.allow(
        key=key,
        max_requests=max_requests,
        window_seconds=window_seconds,
        block_seconds=block_seconds,
    )
    if decision.allowed:
        return
    logger.warning(
        "rate limit exceeded",
        event_type="auth.event",
        severity="WARNING",
        action=action,
        outcome="rate_limited",
        retry_after_seconds=decision.retry_after_seconds,
    )
    raise RateLimitExceeded("Too many attempts. Please wait and retry.")


async def _verify_bot_token(bot_token: str, client_ip: str | None) -> bool:
    settings = get_settings()
    if not settings.should_require_bot_protection:
        return True
    if not bot_token or not settings.bot_secret_key:
        return False

    payload: dict[str, Any] = {"secret": settings.bot_secret_key, "response": bot_token}
    if client_ip:
        payload["remoteip"] = client_ip

    response = await outbound_request(
        op="auth.bot.verify",
        method="POST",
        url=settings.bot_verify_url,
        json=payload,
        log_payload=False,
    )
    parsed = response.json()
    return bool(parsed.get("success"))


def _session_hash(raw_session_token: str, session_secret: str) -> str:
    return _hash_with_secret(raw_session_token, session_secret)


async def _create_session_for_user_email(
    *,
    op: DBOperation,
    user_email: str,
    settings: Any,
) -> AuthSessionResult:
    user = (await op.session.execute(select(User).where(User.email == user_email))).scalar_one_or_none()
    if user is None:
        user = User(email=user_email)
        op.session.add(user)
        await op.session.flush()

    user.last_login_at = _utc_now()
    session_id = str(uuid4())
    session_secret_token = secrets.token_urlsafe(32)
    session_token = f"{session_id}.{session_secret_token}"
    session_hash = _session_hash(session_token, settings.session_secret)
    expires_at = _utc_now() + timedelta(minutes=settings.session_ttl_minutes)
    op.session.add(
        AuthSession(
            session_id=session_id,
            session_hash=session_hash,
            user_id=user.id,
            expires_at=expires_at,
        )
    )
    return AuthSessionResult(session_token=session_token, user_email=user_email)


async def start_login_challenge(
    *,
    email: str,
    client_ip: str | None,
    bot_token: str | None,
) -> None:
    settings = get_settings()
    normalized_email = email.strip().lower()

    if not settings.is_email_allowed(normalized_email):
        logger.warning(
            "auth start denied",
            event_type="auth.event",
            severity="WARNING",
            action="start",
            outcome="denied_email_policy",
            email=normalized_email,
        )
        raise ForbiddenEmail("Email is not allowed for this application.")

    if settings.dev_auth_bypass and settings.app_env not in {"local", "test"}:
        raise ForbiddenEmail("DEV_AUTH_BYPASS can only be enabled in local or test.")

    if settings.should_require_bot_protection:
        bot_ok = await _verify_bot_token(bot_token=bot_token or "", client_ip=client_ip)
        if not bot_ok:
            logger.warning(
                "bot token rejected",
                event_type="auth.event",
                severity="WARNING",
                action="start",
                outcome="bot_failed",
                email=normalized_email,
            )
            raise ForbiddenEmail("Bot verification failed.")

    _check_rate_limit(
        key=f"auth:start:email:{normalized_email}",
        max_requests=settings.auth_email_max_requests_per_10m,
        window_seconds=600,
        block_seconds=120,
        action="start",
    )
    _check_rate_limit(
        key=f"auth:start:ip:{client_ip or 'unknown'}",
        max_requests=settings.auth_ip_max_requests_per_10m,
        window_seconds=600,
        block_seconds=120,
        action="start",
    )

    code = _make_challenge_code(settings.auth_code_length)
    code_hash = _hash_with_secret(code, settings.session_secret)
    expires_at = _utc_now() + timedelta(minutes=settings.auth_code_ttl_minutes)

    async with operation("auth.login_start") as op:
        await op.session.execute(delete(AuthLoginCode).where(AuthLoginCode.email == normalized_email))
        op.session.add(
            AuthLoginCode(
                email=normalized_email,
                code_hash=code_hash,
                expires_at=expires_at,
                attempts=0,
            )
        )
        await op.session.commit()

    provider = get_challenge_provider()
    await provider.send_code(email=normalized_email, code=code)
    logger.info(
        "auth challenge started",
        event_type="auth.event",
        severity="INFO",
        action="start",
        outcome="challenge_sent",
        email=normalized_email,
    )


def _latest_login_code_stmt(email: str) -> Select[tuple[AuthLoginCode]]:
    return select(AuthLoginCode).where(AuthLoginCode.email == email).order_by(AuthLoginCode.created_at.desc()).limit(1)


async def verify_login_challenge(*, email: str, code: str, client_ip: str | None) -> AuthSessionResult:
    settings = get_settings()
    normalized_email = email.strip().lower()

    _check_rate_limit(
        key=f"auth:verify:email:{normalized_email}",
        max_requests=settings.auth_verify_max_attempts_per_10m,
        window_seconds=600,
        block_seconds=300,
        action="verify",
    )
    _check_rate_limit(
        key=f"auth:verify:ip:{client_ip or 'unknown'}",
        max_requests=settings.auth_verify_max_attempts_per_10m,
        window_seconds=600,
        block_seconds=300,
        action="verify",
    )

    async with operation("auth.login_verify") as op:
        code_row = (await op.session.execute(_latest_login_code_stmt(normalized_email))).scalar_one_or_none()
        if code_row is None:
            raise InvalidChallengeCode("Code is invalid or expired.")
        if _normalize_datetime(code_row.expires_at) <= _utc_now():
            raise InvalidChallengeCode("Code is invalid or expired.")
        if code_row.attempts >= settings.auth_max_verify_attempts:
            raise RateLimitExceeded("Too many invalid attempts. Please request a new code.")

        submitted_code_hash = _hash_with_secret(code.strip(), settings.session_secret)
        if not hmac.compare_digest(code_row.code_hash, submitted_code_hash):
            code_row.attempts += 1
            await op.session.commit()
            raise InvalidChallengeCode("Code is invalid or expired.")

        session_result = await _create_session_for_user_email(
            op=op,
            user_email=normalized_email,
            settings=settings,
        )
        await op.session.execute(delete(AuthLoginCode).where(AuthLoginCode.email == normalized_email))
        await op.session.commit()

    logger.info(
        "auth challenge verified",
        event_type="auth.event",
        severity="INFO",
        action="verify",
        outcome="success",
        email=normalized_email,
    )
    return session_result


async def login_with_dev_password(
    *,
    username: str,
    password: str,
    client_ip: str | None,
) -> AuthSessionResult:
    settings = get_settings()
    if not settings.can_use_dev_password_login:
        logger.warning(
            "dev password login denied by environment",
            event_type="auth.event",
            severity="WARNING",
            action="password_login",
            outcome="denied_environment",
        )
        raise ForbiddenAuthMethod("Password login is only enabled in local/test environments.")

    _check_rate_limit(
        key=f"auth:password:ip:{client_ip or 'unknown'}",
        max_requests=settings.auth_verify_max_attempts_per_10m,
        window_seconds=600,
        block_seconds=300,
        action="password_login",
    )

    normalized_username = username.strip()
    expected_username = settings.dev_password_login_username.strip()
    username_ok = hmac.compare_digest(normalized_username, expected_username)
    password_ok = hmac.compare_digest(password, settings.dev_password_login_password)
    if not (username_ok and password_ok):
        logger.warning(
            "dev password login failed",
            event_type="auth.event",
            severity="WARNING",
            action="password_login",
            outcome="invalid_credentials",
            username=normalized_username,
        )
        raise InvalidChallengeCode("Invalid username or password.")

    async with operation("auth.password_login") as op:
        session_result = await _create_session_for_user_email(
            op=op,
            user_email=settings.dev_password_login_email.strip().lower(),
            settings=settings,
        )
        await op.session.commit()

    logger.info(
        "dev password login succeeded",
        event_type="auth.event",
        severity="INFO",
        action="password_login",
        outcome="success",
        email=session_result.user_email,
    )
    return session_result


async def resolve_user_from_session_token(session_token: str) -> str | None:
    settings = get_settings()
    if settings.dev_auth_bypass and settings.app_env in {"local", "test"}:
        logger.info(
            "dev auth bypass used",
            event_type="auth.event",
            severity="INFO",
            action="session_lookup",
            outcome="dev_bypass",
            email=settings.dev_user_email,
        )
        return settings.dev_user_email

    if "." not in session_token:
        return None

    session_id, _ = session_token.split(".", maxsplit=1)
    session_hash = _session_hash(session_token, settings.session_secret)

    async with operation("auth.session_lookup") as op:
        session_row = (
            await op.session.execute(
                select(AuthSession).where(
                    AuthSession.session_id == session_id,
                    AuthSession.session_hash == session_hash,
                    AuthSession.revoked_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if session_row is None:
            return None
        if _normalize_datetime(session_row.expires_at) <= _utc_now():
            return None

        user = (await op.session.execute(select(User).where(User.id == session_row.user_id))).scalar_one_or_none()
        if user is None:
            return None
        return user.email


async def logout_session(session_token: str) -> None:
    if "." not in session_token:
        return
    settings = get_settings()
    session_id, _ = session_token.split(".", maxsplit=1)
    session_hash = _session_hash(session_token, settings.session_secret)

    async with operation("auth.logout") as op:
        session_row = (
            await op.session.execute(
                select(AuthSession).where(
                    AuthSession.session_id == session_id,
                    AuthSession.session_hash == session_hash,
                )
            )
        ).scalar_one_or_none()
        if session_row is None:
            await op.session.rollback()
            return
        session_row.revoked_at = _utc_now()
        await op.session.commit()

    logger.info(
        "auth logout completed",
        event_type="auth.event",
        severity="INFO",
        action="logout",
        outcome="success",
    )
