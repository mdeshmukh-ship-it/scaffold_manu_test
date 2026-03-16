from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download  # type: ignore[import-not-found]
from huggingface_hub.errors import LocalEntryNotFoundError  # type: ignore[import-not-found]

from api.settings import get_settings


class LocalModelSetupError(RuntimeError):
    pass


def ensure_local_model_available(*, model_name: str | None = None, download: bool) -> Path:
    """Ensure the configured local model is available in the Hugging Face cache"""
    resolved_model_name = (model_name or get_settings().llm_model).strip()
    try:
        model_path = snapshot_download(
            repo_id=resolved_model_name,
            local_files_only=not download,
        )
    except LocalEntryNotFoundError as exc:
        raise LocalModelSetupError(
            f"Model '{resolved_model_name}' is not available in the local Hugging Face cache. "
            "Run `make llm_local_setup` first."
        ) from exc
    return Path(model_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare the local Qwen model in the Hugging Face cache.")
    parser.add_argument("--check", action="store_true", help="Check whether the configured model is already cached.")
    args = parser.parse_args()

    settings = get_settings()
    model_name = settings.llm_model.strip()

    if not args.check:
        print(f"Preparing local model {model_name}.")
        print("This downloads about 4.5 GB into the normal Hugging Face cache and does not require an API key.")

    try:
        model_path = ensure_local_model_available(model_name=model_name, download=not args.check)
    except LocalModelSetupError as exc:
        print(str(exc))
        return 1

    if args.check:
        print(f"Local model ready: {model_name}")
        print(f"Cache path: {model_path}")
        return 0

    print(f"Local model ready in cache: {model_path}")
    print("You can now run `make dev` or `make llm_local_start`.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
