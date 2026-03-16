#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run/dev"
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

export APP_ENV="${APP_ENV:-local}"
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://app:app@127.0.0.1:5432/scaffold}"
export AUTH_ALLOWED_EMAIL_DOMAINS="${AUTH_ALLOWED_EMAIL_DOMAINS:-example.com}"
export SESSION_SECRET="${SESSION_SECRET:-dev-only-change-me}"
export DEV_PASSWORD_LOGIN_ENABLED="${DEV_PASSWORD_LOGIN_ENABLED:-true}"
export DEV_PASSWORD_LOGIN_USERNAME="${DEV_PASSWORD_LOGIN_USERNAME:-admin}"
export DEV_PASSWORD_LOGIN_PASSWORD="${DEV_PASSWORD_LOGIN_PASSWORD:-local-dev-password}"
export DEV_PASSWORD_LOGIN_EMAIL="${DEV_PASSWORD_LOGIN_EMAIL:-admin@example.com}"
export LLM_PROVIDER="${LLM_PROVIDER:-local_qwen}"
export LLM_MODEL="${LLM_MODEL:-Qwen/Qwen3.5-2B}"
export LLM_LOCAL_BASE_URL="${LLM_LOCAL_BASE_URL:-http://127.0.0.1:8002}"

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

mkdir -p "$PID_DIR"

if [[ -f "$PID_DIR/api.pid" || -f "$PID_DIR/web.pid" || -f "$PID_DIR/llm.pid" ]]; then
  echo "Detected existing dev pid files. Attempting cleanup first..."
  "$ROOT_DIR/scripts/dev_stop.sh" >/dev/null 2>&1 || true
  mkdir -p "$PID_DIR"
fi

LLM_PID=""
if [[ "$LLM_PROVIDER" == "local_qwen" ]]; then
  "$ROOT_DIR/scripts/llm_local_start.sh"
  if [[ -f "$PID_DIR/llm.pid" ]]; then
    LLM_PID="$(tr -d '[:space:]' < "$PID_DIR/llm.pid")"
  fi
fi

echo "Starting local Postgres via docker compose..."
docker compose up -d db

echo "Applying migrations..."
(
  cd apps/api
  uv run alembic upgrade head
)

echo "Starting API on http://127.0.0.1:8001 ..."
(
  cd apps/api
  exec uv run python -m api.main
) &
API_PID=$!
printf '%s\n' "$API_PID" > "$PID_DIR/api.pid"

echo "Starting web on http://127.0.0.1:3000 ..."
(
  cd apps/web
  exec yarn dev
) &
WEB_PID=$!
printf '%s\n' "$WEB_PID" > "$PID_DIR/web.pid"

cleanup() {
  echo "Stopping dev processes..."
  stop_process_tree "$WEB_PID"
  stop_process_tree "$API_PID"
  if [[ -n "$LLM_PID" ]]; then
    stop_process_tree "$LLM_PID"
  fi
  rm -f "$PID_DIR/api.pid" "$PID_DIR/web.pid" "$PID_DIR/llm.pid"
  rmdir "$PID_DIR" 2>/dev/null || true
  WAIT_PIDS=("$API_PID" "$WEB_PID")
  if [[ -n "$LLM_PID" ]]; then
    WAIT_PIDS+=("$LLM_PID")
  fi
  wait "${WAIT_PIDS[@]}" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "Local services:"
echo "  - Web: http://127.0.0.1:3000"
echo "  - API: http://127.0.0.1:8001"
echo "  - Health: http://127.0.0.1:8001/api/healthz"
if [[ -n "$LLM_PID" ]]; then
  echo "  - Local LLM: ${LLM_LOCAL_BASE_URL} (first summary request may take a while while the model loads)"
fi
echo "  - Stop later if needed: make dev_stop"

WAIT_PIDS=("$API_PID" "$WEB_PID")
if [[ -n "$LLM_PID" ]]; then
  WAIT_PIDS+=("$LLM_PID")
fi
wait_for_first_exit "${WAIT_PIDS[@]}"
