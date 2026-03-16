#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP_DIR="$ROOT_DIR/.run/llm-local"
SETUP_MARKER="$SETUP_DIR/model.txt"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export LLM_PROVIDER="${LLM_PROVIDER:-local_qwen}"
export LLM_MODEL="${LLM_MODEL:-Qwen/Qwen3.5-2B}"
export LLM_LOCAL_BASE_URL="${LLM_LOCAL_BASE_URL:-http://127.0.0.1:8002}"

mkdir -p "$SETUP_DIR"

echo "Installing optional local LLM dependencies..."
(
  cd apps/api
  uv sync --group llm_local
)

echo "Preparing the local Qwen model cache..."
(
  cd apps/api
  uv run --group llm_local python -m api.llm.local_setup
)

printf '%s\n' "$LLM_MODEL" > "$SETUP_MARKER"

echo ""
echo "Local Qwen setup complete."
echo "Next steps:"
echo "  1. Run make dev"
echo "  2. The local Qwen runtime will auto-start when LLM_PROVIDER=local_qwen"
echo "  3. Your first summary request may take a while while the model loads into memory"
