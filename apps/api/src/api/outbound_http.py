from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlsplit

import httpx

from api.logging_config import get_logger
from api.redaction import redact_headers, redact_url, serialize_payload

logger = get_logger(__name__)


class OutboundHTTPClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient()

    async def request(
        self,
        *,
        op: str,
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
        json: Any = None,
        timeout: float = 10.0,
        log_payload: bool = False,
    ) -> httpx.Response:
        started = time.perf_counter()
        sanitized_url = redact_url(url)
        parsed_url = urlsplit(sanitized_url)
        sanitized_headers = redact_headers(headers)
        request_payload = serialize_payload(json) if log_payload else None

        try:
            response = await self._client.request(
                method=method.upper(),
                url=url,
                headers=headers,
                params=params,
                json=json,
                timeout=timeout,
            )
            duration_ms = round((time.perf_counter() - started) * 1000, 3)
            severity = "INFO" if response.status_code < 400 else "WARNING"
            logger.info(
                "outbound http completed",
                event_type="http.outbound",
                severity=severity,
                op=op,
                method=method.upper(),
                destination_host=parsed_url.netloc,
                path=parsed_url.path,
                status=response.status_code,
                duration_ms=duration_ms,
                ok=response.status_code < 400,
                request_url=sanitized_url,
                request_headers=sanitized_headers,
                request_payload=request_payload,
            )
            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - started) * 1000, 3)
            logger.error(
                "outbound http failed",
                event_type="http.outbound",
                severity="ERROR",
                op=op,
                method=method.upper(),
                destination_host=parsed_url.netloc,
                path=parsed_url.path,
                duration_ms=duration_ms,
                ok=False,
                request_url=sanitized_url,
                request_headers=sanitized_headers,
                request_payload=request_payload,
                error_type=exc.__class__.__name__,
                error_message=str(exc)[:256],
            )
            raise

    async def aclose(self) -> None:
        await self._client.aclose()


outbound = OutboundHTTPClient()


async def request(**kwargs: Any) -> httpx.Response:
    return await outbound.request(**kwargs)
