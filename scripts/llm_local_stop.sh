#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.run/dev/llm.pid"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/process_helpers.sh"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Local Qwen runtime is not running."
  exit 0
fi

LLM_PID="$(tr -d '[:space:]' < "$PID_FILE")"
if [[ -n "$LLM_PID" ]]; then
  stop_process_tree "$LLM_PID"
fi

rm -f "$PID_FILE"
echo "Stopped local Qwen runtime."
