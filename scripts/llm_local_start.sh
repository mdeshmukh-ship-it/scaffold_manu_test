#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run/dev"
PID_FILE="$PID_DIR/llm.pid"
SETUP_MARKER="$ROOT_DIR/.run/llm-local/model.txt"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/process_helpers.sh"

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

mkdir -p "$PID_DIR"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(tr -d '[:space:]' < "$PID_FILE")"
  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Local Qwen runtime is already running."
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [[ ! -f "$SETUP_MARKER" ]] || [[ "$(tr -d '[:space:]' < "$SETUP_MARKER")" != "$LLM_MODEL" ]]; then
  echo "Local Qwen is not set up for ${LLM_MODEL}. Run make llm_local_setup first." >&2
  exit 1
fi

if ! (
  cd apps/api
  uv run --group llm_local python -m api.llm.local_setup --check >/dev/null
); then
  echo "The local model cache is missing or stale. Run make llm_local_setup first." >&2
  exit 1
fi

echo "Starting local Qwen runtime on ${LLM_LOCAL_BASE_URL} ..."
(
  cd apps/api
  exec uv run --group llm_local python -m api.llm.local_runtime
) &
LLM_PID=$!
printf '%s\n' "$LLM_PID" > "$PID_FILE"

for _ in {1..60}; do
  if ! kill -0 "$LLM_PID" 2>/dev/null; then
    echo "Local Qwen runtime exited during startup." >&2
    rm -f "$PID_FILE"
    exit 1
  fi

  if python3 - "$LLM_LOCAL_BASE_URL" <<'PY'
import json
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")
try:
    with urllib.request.urlopen(f"{base_url}/healthz", timeout=2) as response:
        payload = json.load(response)
    sys.exit(0 if payload.get("ok") else 1)
except Exception:
    sys.exit(1)
PY
  then
    echo "Local Qwen runtime ready."
    exit 0
  fi

  sleep 1
done

echo "Local Qwen runtime did not become ready in time." >&2
stop_process_tree "$LLM_PID"
rm -f "$PID_FILE"
exit 1
