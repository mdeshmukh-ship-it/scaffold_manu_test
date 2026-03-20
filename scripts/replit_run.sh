#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run/dev"
cd "$ROOT_DIR"

# Ensure uv is on PATH (installed to workspace/.local/bin on Replit)
export HOME="${HOME:-/home/runner}"
if [[ -d "$HOME/workspace/.local/bin" ]]; then
  export PATH="$HOME/workspace/.local/bin:$PATH"
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/process_helpers.sh"

# Force SQLite for Replit — always override to avoid psycopg2 issues
export DATABASE_URL="sqlite+aiosqlite:///tmp/scaffold-replit.db"

export APP_ENV="${APP_ENV:-local}"
export AUTH_ALLOWED_EMAIL_DOMAINS="${AUTH_ALLOWED_EMAIL_DOMAINS:-}"
export SESSION_SECRET="${SESSION_SECRET:-replit-dev-secret}"
export DEV_PASSWORD_LOGIN_ENABLED="${DEV_PASSWORD_LOGIN_ENABLED:-true}"
export DEV_PASSWORD_LOGIN_USERNAME="${DEV_PASSWORD_LOGIN_USERNAME:-admin}"
export DEV_PASSWORD_LOGIN_PASSWORD="${DEV_PASSWORD_LOGIN_PASSWORD:-local-dev-password}"
export DEV_PASSWORD_LOGIN_EMAIL="${DEV_PASSWORD_LOGIN_EMAIL:-admin@example.com}"
export LLM_PROVIDER="${LLM_PROVIDER:-none}"
export LLM_MODEL="${LLM_MODEL:-Qwen/Qwen3.5-2B}"
export LLM_LOCAL_BASE_URL="${LLM_LOCAL_BASE_URL:-http://127.0.0.1:8002}"

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

LLM_PID=""
if [[ "$LLM_PROVIDER" == "local_qwen" ]]; then
  if "$ROOT_DIR/scripts/llm_local_start.sh" 2>/dev/null; then
    if [[ -f "$PID_DIR/llm.pid" ]]; then
      LLM_PID="$(tr -d '[:space:]' < "$PID_DIR/llm.pid")"
    fi
  else
    echo "⚠️  Local LLM not set up — skipping. Run 'make llm_local_setup' if needed."
    export LLM_PROVIDER="none"
  fi
fi

echo "Running API + Web for Replit..."

(
  cd apps/api
  exec uv run python -m api.main
) &
API_PID=$!

(
  cd apps/web
  exec yarn dev --hostname 0.0.0.0 --port "${PORT:-3000}"
) &
WEB_PID=$!

cleanup() {
  stop_process_tree "$WEB_PID"
  stop_process_tree "$API_PID"
  if [[ -n "$LLM_PID" ]]; then
    stop_process_tree "$LLM_PID"
    rm -f "$PID_DIR/llm.pid"
  fi
  WAIT_PIDS=("$API_PID" "$WEB_PID")
  if [[ -n "$LLM_PID" ]]; then
    WAIT_PIDS+=("$LLM_PID")
  fi
  wait "${WAIT_PIDS[@]}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT
WAIT_PIDS=("$API_PID" "$WEB_PID")
if [[ -n "$LLM_PID" ]]; then
  WAIT_PIDS+=("$LLM_PID")
fi
wait_for_first_exit "${WAIT_PIDS[@]}"
