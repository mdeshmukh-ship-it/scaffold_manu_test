from __future__ import annotations

import asyncio
import inspect
import re
import threading
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as installed_package_version
from time import perf_counter
from typing import Any
from urllib.parse import urlparse

import torch  # type: ignore[import-not-found]
import tornado.ioloop
import tornado.web
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore[import-not-found]

from api.llm.local_setup import LocalModelSetupError, ensure_local_model_available
from api.logging_config import configure_logging, get_logger
from api.settings import get_settings

logger = get_logger(__name__)
THINK_BLOCK_PATTERN = re.compile(r"<think>.*?</think>", re.DOTALL)
MINIMUM_TRANSFORMERS_VERSION = (5, 2, 0)


class GenerateRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    system_prompt: str | None = None
    user_prompt: str = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=400, ge=1, le=4096)


class GenerateResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    provider: str
    model: str


@dataclass
class LoadedLocalModel:
    model_name: str
    tokenizer: Any
    model: Any


class LocalQwenRuntime:
    """Serves local text generation requests through one loaded Hugging Face model"""

    def __init__(self) -> None:
        self._loaded_model: LoadedLocalModel | None = None
        self._lock = threading.Lock()

    def health(self) -> dict[str, Any]:
        """Return runtime health details"""
        loaded_model_name = self._loaded_model.model_name if self._loaded_model else None
        loaded_model = self._loaded_model.model if self._loaded_model else None
        return {
            "ok": True,
            "loaded": self._loaded_model is not None,
            "model": loaded_model_name,
            "device": _resolve_model_device(loaded_model) if loaded_model is not None else None,
        }

    def generate(self, request_model: GenerateRequestModel) -> GenerateResponseModel:
        """Generate text for one local Qwen request"""
        with self._lock:
            loaded_model = self._load_model(request_model.model)
            prompt = _build_chat_prompt(
                tokenizer=loaded_model.tokenizer,
                system_prompt=request_model.system_prompt,
                user_prompt=request_model.user_prompt,
            )
            model_inputs = _prepare_model_inputs(
                tokenizer=loaded_model.tokenizer,
                prompt=prompt,
                model=loaded_model.model,
            )
            generation_kwargs: dict[str, Any] = {
                "max_new_tokens": request_model.max_output_tokens,
                "pad_token_id": loaded_model.tokenizer.pad_token_id,
            }
            if request_model.temperature > 0:
                generation_kwargs["do_sample"] = True
                generation_kwargs["temperature"] = request_model.temperature
            else:
                generation_kwargs["do_sample"] = False

            with torch.inference_mode():
                generated_ids = loaded_model.model.generate(**model_inputs, **generation_kwargs)

            prompt_token_count = int(model_inputs["input_ids"].shape[-1])
            response_tokens = generated_ids[0][prompt_token_count:]
            text = loaded_model.tokenizer.decode(response_tokens, skip_special_tokens=True).strip()
            cleaned_text = _strip_thinking_blocks(text) or text
            return GenerateResponseModel(
                text=cleaned_text,
                provider="local_qwen",
                model=request_model.model,
            )

    def _load_model(self, model_name: str) -> LoadedLocalModel:
        """Load the requested model into memory when needed"""
        if self._loaded_model and self._loaded_model.model_name == model_name:
            return self._loaded_model

        _ensure_transformers_supports_qwen3_5()
        model_path = ensure_local_model_available(model_name=model_name, download=False)
        logger.info(
            "loading local qwen model",
            event_type="app.event",
            severity="INFO",
            model=model_name,
        )
        tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
        if tokenizer.pad_token_id is None and tokenizer.eos_token_id is not None:
            tokenizer.pad_token = tokenizer.eos_token
        try:
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                local_files_only=True,
                torch_dtype="auto",
                device_map="auto",
                low_cpu_mem_usage=True,
            )
        except (KeyError, ValueError) as exc:
            message = str(exc)
            if "qwen3_5" in message or "does not recognize this architecture" in message:
                raise LocalModelSetupError(_unsupported_transformers_message()) from exc
            raise
        model.eval()
        self._loaded_model = LoadedLocalModel(
            model_name=model_name,
            tokenizer=tokenizer,
            model=model,
        )
        logger.info(
            "local qwen model loaded",
            event_type="app.event",
            severity="INFO",
            model=model_name,
            device=_resolve_model_device(model),
        )
        return self._loaded_model


class HealthHandler(tornado.web.RequestHandler):
    """Exposes runtime health information"""

    def initialize(self, runtime: LocalQwenRuntime) -> None:
        self.runtime = runtime

    def get(self) -> None:
        self.write(self.runtime.health())


class GenerateHandler(tornado.web.RequestHandler):
    """Handles one local generation request"""

    def initialize(self, runtime: LocalQwenRuntime) -> None:
        self.runtime = runtime

    async def post(self) -> None:
        started_at = perf_counter()
        try:
            request_model = GenerateRequestModel.model_validate_json(self.request.body or b"{}")
        except ValidationError as exc:
            logger.warning(
                "local qwen request validation failed",
                event_type="http.request",
                severity="WARNING",
                path=self.request.path,
                status=400,
            )
            self.set_status(400)
            self.write({"error": "Invalid local Qwen request.", "details": exc.errors(include_url=False)})
            return

        try:
            response_model = await asyncio.to_thread(self.runtime.generate, request_model)
        except LocalModelSetupError as exc:
            logger.warning(
                "local qwen model is not set up",
                event_type="http.request",
                severity="WARNING",
                path=self.request.path,
                status=503,
            )
            self.set_status(503)
            self.write({"error": str(exc)})
            return
        except Exception:
            logger.exception(
                "local qwen request failed",
                event_type="http.request",
                severity="ERROR",
                path=self.request.path,
                status=500,
            )
            self.set_status(500)
            self.write({"error": "Local Qwen generation failed."})
            return

        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        logger.info(
            "local qwen request completed",
            event_type="http.request",
            severity="INFO",
            path=self.request.path,
            status=200,
            duration_ms=duration_ms,
            model=response_model.model,
        )
        self.write(response_model.model_dump())


def _build_chat_prompt(*, tokenizer: Any, system_prompt: str | None, user_prompt: str) -> str:
    """Build a chat-formatted prompt for the configured tokenizer"""
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    if hasattr(tokenizer, "apply_chat_template"):
        apply_kwargs: dict[str, Any] = {
            "tokenize": False,
            "add_generation_prompt": True,
        }
        enable_thinking_supported = False
        try:
            apply_signature = inspect.signature(tokenizer.apply_chat_template)
        except (TypeError, ValueError):
            apply_signature = None
        if apply_signature is not None and "enable_thinking" in apply_signature.parameters:
            enable_thinking_supported = True
        if enable_thinking_supported:
            apply_kwargs["enable_thinking"] = False
        return str(tokenizer.apply_chat_template(messages, **apply_kwargs))

    prompt_parts = [f"{message['role'].upper()}: {message['content']}" for message in messages]
    prompt_parts.append("ASSISTANT:")
    return "\n".join(prompt_parts)


def _ensure_transformers_supports_qwen3_5() -> None:
    """Raise a clear setup error when Transformers is too old for Qwen 3.5"""
    if _installed_transformers_version_tuple() < MINIMUM_TRANSFORMERS_VERSION:
        raise LocalModelSetupError(_unsupported_transformers_message())


def _installed_transformers_version_tuple() -> tuple[int, int, int]:
    """Parse the installed Transformers version into a comparable tuple"""
    try:
        installed_version = installed_package_version("transformers")
    except PackageNotFoundError:
        return (0, 0, 0)

    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", installed_version)
    if match is None:
        return (0, 0, 0)
    major, minor, patch = match.groups()
    return (int(major), int(minor), int(patch))


def _unsupported_transformers_message() -> str:
    """Describe how to upgrade the local runtime for Qwen 3.5 support"""
    try:
        installed_version = installed_package_version("transformers")
    except PackageNotFoundError:
        installed_version = "not installed"
    return (
        "Qwen/Qwen3.5-2B requires transformers 5.2.0 or newer. "
        f"Detected transformers {installed_version}. Run `make llm_local_setup` again to upgrade the local LLM runtime."
    )


def _prepare_model_inputs(*, tokenizer: Any, prompt: str, model: Any) -> dict[str, Any]:
    """Tokenize one prompt and move tensors onto the model device"""
    encoded = tokenizer(prompt, return_tensors="pt")
    model_device = torch.device(_resolve_model_device(model))
    return {name: tensor.to(model_device) for name, tensor in encoded.items()}


def _strip_thinking_blocks(text: str) -> str:
    """Remove model thinking tags from the visible response"""
    cleaned_text = THINK_BLOCK_PATTERN.sub("", text)
    return cleaned_text.replace("<think>", "").replace("</think>", "").strip()


def _resolve_model_device(model: Any) -> str:
    """Resolve the device that should receive prompt tensors"""
    try:
        first_parameter = next(model.parameters())
    except StopIteration:
        return "cpu"
    return str(first_parameter.device)


def _create_app(runtime: LocalQwenRuntime) -> tornado.web.Application:
    """Create the local Qwen HTTP app"""
    return tornado.web.Application(
        [
            (r"/healthz", HealthHandler, {"runtime": runtime}),
            (r"/generate", GenerateHandler, {"runtime": runtime}),
        ]
    )


def main() -> None:
    """Run the local Qwen runtime"""
    configure_logging()
    _ensure_transformers_supports_qwen3_5()
    settings = get_settings()
    parsed_base_url = urlparse(settings.llm_local_base_url)
    host = parsed_base_url.hostname or "127.0.0.1"
    port = parsed_base_url.port or 8002

    runtime = LocalQwenRuntime()
    app = _create_app(runtime)
    app.listen(port=port, address=host)
    logger.info(
        "local qwen runtime started",
        event_type="app.event",
        severity="INFO",
        host=host,
        port=port,
        model=settings.llm_model,
    )
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
