#!/usr/bin/env bash

process_has_exited() {
  local pid="$1"
  local process_state=""

  if [[ -z "$pid" ]]; then
    return 0
  fi

  process_state="$(ps -p "$pid" -o stat= 2>/dev/null | tr -d '[:space:]')"
  [[ -z "$process_state" || "$process_state" == Z* ]]
}

wait_for_first_exit() {
  local pid=""

  if [[ $# -eq 0 ]]; then
    echo "wait_for_first_exit requires at least one pid" >&2
    return 1
  fi

  # macOS ships Bash 3.2, which does not support `wait -n`.
  while true; do
    for pid in "$@"; do
      if process_has_exited "$pid"; then
        wait "$pid"
        return $?
      fi
    done
    sleep 0.2
  done
}

collect_descendant_pids() {
  local parent_pid="$1"
  local child_pid=""

  while IFS= read -r child_pid; do
    [[ -n "$child_pid" ]] || continue
    collect_descendant_pids "$child_pid"
    printf '%s\n' "$child_pid"
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)
}

stop_process_tree() {
  local root_pid="$1"
  local all_pids=()
  local pid=""

  if [[ -z "$root_pid" ]] || ! kill -0 "$root_pid" 2>/dev/null; then
    return 0
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    all_pids+=("$pid")
  done < <(collect_descendant_pids "$root_pid")

  all_pids+=("$root_pid")

  kill -TERM "${all_pids[@]}" 2>/dev/null || true
  sleep 1

  local remaining_pids=()
  for pid in "${all_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      remaining_pids+=("$pid")
    fi
  done

  if [[ ${#remaining_pids[@]} -gt 0 ]]; then
    kill -KILL "${remaining_pids[@]}" 2>/dev/null || true
  fi
}
