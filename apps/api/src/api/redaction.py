from __future__ import annotations

import json
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

REDACTED = "***REDACTED***"
SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"}
SENSITIVE_KEY_PATTERN = re.compile(r"(token|key|secret|password|signature)", re.IGNORECASE)
MAX_LOG_PAYLOAD_BYTES = 8 * 1024


def is_sensitive_key(key: str) -> bool:
    return bool(SENSITIVE_KEY_PATTERN.search(key))


def redact_headers(headers: Mapping[str, str] | None) -> dict[str, str]:
    if not headers:
        return {}
    redacted: dict[str, str] = {}
    for key, value in headers.items():
        if key.lower() in SENSITIVE_HEADERS or is_sensitive_key(key):
            redacted[key] = REDACTED
        else:
            redacted[key] = value
    return redacted


def redact_url(url: str) -> str:
    parsed = urlsplit(url)
    params = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if is_sensitive_key(key):
            params.append((key, REDACTED))
        else:
            params.append((key, value))
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(params), parsed.fragment))


def redact_json_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        output: dict[str, Any] = {}
        for key, item in value.items():
            if is_sensitive_key(str(key)):
                output[str(key)] = REDACTED
            else:
                output[str(key)] = redact_json_value(item)
        return output
    if isinstance(value, list):
        return [redact_json_value(item) for item in value]
    return value


def serialize_payload(payload: Any, max_bytes: int = MAX_LOG_PAYLOAD_BYTES) -> str | None:
    if payload is None:
        return None
    redacted = redact_json_value(payload)
    try:
        serialized = json.dumps(redacted, ensure_ascii=True)
    except (TypeError, ValueError):
        serialized = str(redacted)

    if len(serialized.encode("utf-8")) <= max_bytes:
        return serialized
    truncated = serialized.encode("utf-8")[: max_bytes - len(b"...<truncated>")]
    return truncated.decode("utf-8", errors="ignore") + "...<truncated>"
