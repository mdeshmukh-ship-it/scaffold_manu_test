#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.run/dev"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/process_helpers.sh"

read_pid_file() {
  local name="$1"
  local path="$PID_DIR/${name}.pid"

  if [[ ! -f "$path" ]]; then
    return 1
  fi

  tr -d '[:space:]' < "$path"
}

stop_named_process() {
  local name="$1"
  local pid=""

  pid="$(read_pid_file "$name" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    return 0
  fi

  stop_process_tree "$pid"
  rm -f "$PID_DIR/${name}.pid"
}

stop_named_process "web"
stop_named_process "api"
stop_named_process "llm"

if command -v docker >/dev/null 2>&1; then
  docker compose stop db >/dev/null 2>&1 || true
fi

rmdir "$PID_DIR" 2>/dev/null || true

echo "Stopped local dev processes."
