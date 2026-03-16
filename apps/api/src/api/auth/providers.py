from __future__ import annotations

from typing import Protocol

from api.logging_config import get_logger
from api.settings import get_settings

logger = get_logger(__name__)
_code_cache_for_tests: dict[str, str] = {}


class ChallengeCodeProvider(Protocol):
    async def send_code(self, *, email: str, code: str) -> None: ...


class ConsoleChallengeCodeProvider:
    async def send_code(self, *, email: str, code: str) -> None:
        settings = get_settings()
        _code_cache_for_tests[email.lower()] = code
        payload = {
            "event_type": "auth.event",
            "severity": "INFO",
            "action": "challenge_sent",
            "outcome": "success",
            "email": email.lower(),
        }
        if settings.app_env in {"local", "test", "replit"}:
            # Local-only convenience for new developers and tests.
            payload["challenge_code"] = code
        logger.info(
            "challenge code issued",
            **payload,
        )


class TwilioChallengeCodeProvider:
    async def send_code(self, *, email: str, code: str) -> None:
        raise NotImplementedError(
            "Twilio provider is a stub in this scaffold. Configure a production provider before L3."
        )


def get_challenge_provider() -> ChallengeCodeProvider:
    settings = get_settings()
    provider_name = settings.auth_provider.strip().lower()
    if provider_name == "twilio":
        return TwilioChallengeCodeProvider()
    return ConsoleChallengeCodeProvider()


def peek_code_for_test(email: str) -> str | None:
    return _code_cache_for_tests.get(email.lower())
