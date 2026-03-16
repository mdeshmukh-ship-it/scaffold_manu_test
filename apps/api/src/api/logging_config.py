from __future__ import annotations

import contextvars
import logging
import sys
from typing import Any

import structlog

_configured = False
_request_context: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "request_context", default=None
)
_operation_name: contextvars.ContextVar[str | None] = contextvars.ContextVar("operation_name", default=None)


def set_request_context(
    *,
    request_id: str,
    user_email: str | None,
    severity_level: str,
    client_ip: str | None,
) -> None:
    _request_context.set(
        {
            "request_id": request_id,
            "user_email": user_email,
            "severity_level": severity_level,
            "client_ip": client_ip,
        }
    )


def set_user_email(user_email: str | None) -> None:
    context = get_request_context()
    context["user_email"] = user_email
    _request_context.set(context)


def clear_request_context() -> None:
    _request_context.set(None)
    _operation_name.set(None)


def set_operation_name(operation_name: str | None) -> contextvars.Token[str | None]:
    return _operation_name.set(operation_name)


def reset_operation_name(token: contextvars.Token[str | None]) -> None:
    _operation_name.reset(token)


def get_operation_name() -> str | None:
    return _operation_name.get()


def get_request_context() -> dict[str, Any]:
    return dict(_request_context.get() or {})


def _inject_context(_: Any, method_name: str, event_dict: structlog.typing.EventDict) -> structlog.typing.EventDict:
    context = _request_context.get() or {}
    event_dict.setdefault("event_type", "app.event")

    message = str(event_dict.pop("event", ""))
    event_dict.setdefault("message", message)
    event_dict.setdefault("severity", method_name.upper())

    event_dict.setdefault("request_id", context.get("request_id"))
    event_dict.setdefault("user_email", context.get("user_email"))
    event_dict.setdefault("severity_level", context.get("severity_level"))
    event_dict.setdefault("client_ip", context.get("client_ip"))

    operation_name = _operation_name.get()
    if operation_name and "op" not in event_dict:
        event_dict["op"] = operation_name
    return event_dict


def configure_logging(level: int = logging.INFO) -> None:
    global _configured
    if _configured:
        return

    logging.basicConfig(stream=sys.stdout, level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp"),
            _inject_context,
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    _configured = True


def get_logger(name: str) -> structlog.typing.FilteringBoundLogger:
    return structlog.get_logger(name)
