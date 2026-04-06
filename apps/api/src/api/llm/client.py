from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from api.logging_config import get_logger
from api.outbound_http import request as outbound_request
from api.settings import get_settings

logger = get_logger(__name__)


class LLMError(RuntimeError):
    pass


class LLMConfigurationError(LLMError):
    pass


class LLMProviderError(LLMError):
    pass


@dataclass(frozen=True)
class LLMRequest:
    system_prompt: str | None
    user_prompt: str
    temperature: float = 0.2
    max_output_tokens: int = 400


@dataclass(frozen=True)
class LLMResponse:
    text: str
    provider: str
    model: str


async def generate_text(
    *,
    op: str,
    request: LLMRequest,
    provider: str | None = None,
    model: str | None = None,
) -> LLMResponse:
    """Generate text through the configured LLM provider"""
    settings = get_settings()
    provider_name = (provider or settings.llm_provider).strip().lower()
    model_name = (model or settings.llm_model).strip()

    if provider_name == "mock":
        return _generate_mock_response(request=request, model_name=model_name)

    if provider_name == "local_qwen":
        return await _generate_local_qwen_response(op=op, request=request, model_name=model_name)

    if provider_name == "openai":
        return await _generate_openai_response(op=op, request=request, model_name=model_name)

    if provider_name == "anthropic":
        return await _generate_anthropic_response(op=op, request=request, model_name=model_name)

    raise LLMConfigurationError(f"Unsupported LLM_PROVIDER '{provider_name}'.")


def _generate_mock_response(*, request: LLMRequest, model_name: str) -> LLMResponse:
    """Generate a deterministic mock response for tests and debugging"""
    preview = " ".join(request.user_prompt.split())
    truncated = preview[:120].rstrip()
    return LLMResponse(
        text=f"Summary: {truncated}",
        provider="mock",
        model=model_name or "mock-notes-summarizer",
    )


async def _generate_local_qwen_response(
    *,
    op: str,
    request: LLMRequest,
    model_name: str,
) -> LLMResponse:
    """Generate text through the local Qwen runtime"""
    settings = get_settings()
    response = await _request_with_retries(
        provider_name="local_qwen",
        op=op,
        url=f"{settings.llm_local_base_url.rstrip('/')}/generate",
        headers={},
        payload={
            "model": model_name,
            "system_prompt": request.system_prompt,
            "user_prompt": request.user_prompt,
            "temperature": request.temperature,
            "max_output_tokens": request.max_output_tokens,
        },
        timeout_seconds=settings.llm_local_timeout_seconds,
    )
    parsed = response.json()
    try:
        text = str(parsed["text"]).strip()
        provider = str(parsed.get("provider", "local_qwen")).strip() or "local_qwen"
        resolved_model = str(parsed.get("model", model_name)).strip() or model_name
    except (KeyError, TypeError) as exc:
        raise LLMProviderError("Local Qwen response did not contain text content.") from exc
    return LLMResponse(text=text, provider=provider, model=resolved_model)


async def _generate_openai_response(
    *,
    op: str,
    request: LLMRequest,
    model_name: str,
) -> LLMResponse:
    """Generate text through the OpenAI chat completions API"""
    settings = get_settings()
    if not settings.openai_api_key:
        raise LLMConfigurationError("OPENAI_API_KEY is required when LLM_PROVIDER=openai.")

    messages: list[dict[str, str]] = []
    if request.system_prompt:
        messages.append({"role": "system", "content": request.system_prompt})
    messages.append({"role": "user", "content": request.user_prompt})

    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": request.temperature,
        "max_tokens": request.max_output_tokens,
    }
    response = await _request_with_retries(
        provider_name="openai",
        op=op,
        url="https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        payload=payload,
        timeout_seconds=settings.llm_timeout_seconds,
    )
    parsed = response.json()
    try:
        text = str(parsed["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMProviderError("OpenAI response did not contain message content.") from exc
    return LLMResponse(text=text, provider="openai", model=model_name)


async def _generate_anthropic_response(
    *,
    op: str,
    request: LLMRequest,
    model_name: str,
) -> LLMResponse:
    """Generate text through the Anthropic messages API"""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LLMConfigurationError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic.")

    payload = {
        "model": model_name,
        "max_tokens": request.max_output_tokens,
        "temperature": request.temperature,
        "system": request.system_prompt or "",
        "messages": [{"role": "user", "content": request.user_prompt}],
    }
    response = await _request_with_retries(
        provider_name="anthropic",
        op=op,
        url="https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
        },
        payload=payload,
        timeout_seconds=settings.llm_timeout_seconds,
    )
    parsed = response.json()
    try:
        content = parsed["content"][0]["text"]
        text = str(content).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMProviderError("Anthropic response did not contain message content.") from exc
    return LLMResponse(text=text, provider="anthropic", model=model_name)


async def _request_with_retries(
    *,
    provider_name: str,
    op: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout_seconds: float,
) -> Any:
    """Retry transient provider failures and return the final HTTP response"""
    settings = get_settings()
    retry_limit = max(settings.llm_max_retries, 0)

    for attempt in range(retry_limit + 1):
        try:
            response = await outbound_request(
                op=f"llm.{provider_name}.{op}",
                method="POST",
                url=url,
                headers=headers,
                json=payload,
                timeout=timeout_seconds,
                log_payload=False,
            )
        except Exception as exc:
            if attempt >= retry_limit:
                raise LLMProviderError(f"{provider_name} request failed after retries.") from exc
            logger.warning(
                "llm request retrying after transport failure",
                event_type="http.outbound",
                severity="WARNING",
                op=f"llm.{provider_name}.{op}",
                attempt=attempt + 1,
            )
            await asyncio.sleep(0.5 * (2**attempt))
            continue

        if response.status_code < 400:
            return response

        if response.status_code in {429, 500, 502, 503, 504} and attempt < retry_limit:
            logger.warning(
                "llm request retrying after provider response",
                event_type="http.outbound",
                severity="WARNING",
                op=f"llm.{provider_name}.{op}",
                attempt=attempt + 1,
                status=response.status_code,
            )
            await asyncio.sleep(0.5 * (2**attempt))
            continue

        raise LLMProviderError(f"{provider_name} returned HTTP {response.status_code}.")

    raise LLMProviderError(f"{provider_name} request failed unexpectedly.")
