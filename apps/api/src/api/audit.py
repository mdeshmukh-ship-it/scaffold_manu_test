from __future__ import annotations

from typing import Any

from api.logging_config import get_logger

logger = get_logger(__name__)


class AuthorizationError(PermissionError):
    pass


def log_authz_decision(
    action: str,
    resource: str,
    allowed: bool,
    reason: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "event_type": "authz.decision",
        "severity": "INFO" if allowed else "WARNING",
        "action": action,
        "resource": resource,
        "allowed": allowed,
    }
    if reason:
        payload["reason"] = reason
    if extra:
        payload.update(extra)
    logger.info("authorization decision", **payload)


def require_authenticated_user_email(
    user_email: str | None,
    *,
    action: str,
    resource: str,
    reason: str = "user is not authenticated",
) -> str:
    if user_email:
        log_authz_decision(action=action, resource=resource, allowed=True)
        return user_email

    log_authz_decision(action=action, resource=resource, allowed=False, reason=reason)
    raise AuthorizationError(reason)
