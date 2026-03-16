#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

failures=0
warnings=0
REQUIRED_PYTHON_VERSION="$(tr -d '[:space:]' < .python-version)"
REQUIRED_NODE_MAJOR="$(tr -d '[:space:]' < .nvmrc)"
LLM_PROVIDER_VALUE="${LLM_PROVIDER:-local_qwen}"
LLM_MODEL_VALUE="${LLM_MODEL:-Qwen/Qwen3.5-2B}"
LLM_LOCAL_SETUP_MARKER=".run/llm-local/model.txt"

check_command() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    echo "[ok] Found ${command_name}"
  else
    echo "[missing] ${command_name} is not installed"
    failures=$((failures + 1))
  fi
}

check_python_version() {
  local detected_version=""
  detected_version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")' 2>/dev/null || true)"

  if [[ -z "$detected_version" ]]; then
    return
  fi

  if [[ "$detected_version" == "${REQUIRED_PYTHON_VERSION}"* ]]; then
    echo "[ok] python3 version ${detected_version}"
    return
  fi

  echo "[missing] python3 version ${detected_version}; expected ${REQUIRED_PYTHON_VERSION}.x"
  echo "          macOS fix: brew install python@${REQUIRED_PYTHON_VERSION}"
  echo "          then add \$(brew --prefix python@${REQUIRED_PYTHON_VERSION})/libexec/bin to your PATH"
  failures=$((failures + 1))
}

check_node_version() {
  local detected_version=""
  detected_version="$(node -p 'process.versions.node' 2>/dev/null || true)"

  if [[ -z "$detected_version" ]]; then
    return
  fi

  if [[ "$detected_version" == "${REQUIRED_NODE_MAJOR}."* ]]; then
    echo "[ok] node version ${detected_version}"
    return
  fi

  echo "[missing] node version ${detected_version}; expected ${REQUIRED_NODE_MAJOR}.x"
  echo "          macOS fix: nvm install ${REQUIRED_NODE_MAJOR} && nvm use ${REQUIRED_NODE_MAJOR} && corepack enable"
  failures=$((failures + 1))
}

warn_if_empty() {
  local env_name="$1"
  local reason="$2"
  local value="${!env_name:-}"
  if [[ -z "$value" ]]; then
    echo "[warn] ${env_name} is not set (${reason})"
    warnings=$((warnings + 1))
  fi
}

check_command python3
check_command uv
check_command node
if command -v python3 >/dev/null 2>&1; then
  check_python_version
fi
if command -v node >/dev/null 2>&1; then
  check_node_version
fi

if command -v yarn >/dev/null 2>&1; then
  echo "[ok] Found yarn"
elif command -v corepack >/dev/null 2>&1; then
  echo "[ok] Found corepack (run make setup to enable yarn automatically)"
else
  echo "[missing] yarn or corepack is not installed"
  failures=$((failures + 1))
fi

if [[ -n "${DATABASE_URL:-}" ]] && [[ "${DATABASE_URL}" != *"127.0.0.1:5432"* ]]; then
  echo "[ok] DATABASE_URL override detected; Docker is optional"
else
  check_command docker
fi

if [[ ! -f .env ]] && [[ ! -f .env.local ]]; then
  echo "[warn] No .env or .env.local found; local defaults will be used"
  warnings=$((warnings + 1))
fi

if [[ ! -d apps/api/.venv ]]; then
  echo "[warn] Backend virtual environment not present yet; run make setup"
  warnings=$((warnings + 1))
else
  echo "[ok] Backend environment detected"
fi

if [[ ! -d apps/web/node_modules ]]; then
  echo "[warn] Frontend dependencies not installed yet; run make setup"
  warnings=$((warnings + 1))
else
  echo "[ok] Frontend dependencies detected"
fi

if [[ "$LLM_PROVIDER_VALUE" == "local_qwen" ]]; then
  if [[ -f "$LLM_LOCAL_SETUP_MARKER" ]] && [[ "$(tr -d '[:space:]' < "$LLM_LOCAL_SETUP_MARKER")" == "$LLM_MODEL_VALUE" ]]; then
    echo "[ok] Local Qwen setup marker detected for ${LLM_MODEL_VALUE}"
  else
    echo "[warn] Local Qwen is not set up yet; run make llm_local_setup (downloads about 4.5 GB)"
    warnings=$((warnings + 1))
  fi
fi

if [[ "$LLM_PROVIDER_VALUE" == "openai" ]]; then
  warn_if_empty "OPENAI_API_KEY" "required when LLM_PROVIDER=openai"
fi

if [[ "$LLM_PROVIDER_VALUE" == "anthropic" ]]; then
  warn_if_empty "ANTHROPIC_API_KEY" "required when LLM_PROVIDER=anthropic"
fi

if [[ "${BOT_PROTECTION_ENABLED:-false}" == "true" ]]; then
  warn_if_empty "BOT_SECRET_KEY" "required when bot protection is enabled"
fi

if [[ -n "${SCHEDULER_SHARED_TOKEN:-}" ]]; then
  echo "[ok] Scheduler shared token detected"
else
  echo "[warn] SCHEDULER_SHARED_TOKEN is not set; scheduled endpoints should stay local-only"
  warnings=$((warnings + 1))
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo "[ok] Docker daemon is running"
  else
    echo "[warn] Docker is installed but the daemon is not running"
    warnings=$((warnings + 1))
  fi
fi

if command -v uv >/dev/null 2>&1 && [[ -d apps/api/.venv ]]; then
  if (
    cd apps/api
    uv run alembic current >/dev/null 2>&1
  ); then
    echo "[ok] Alembic can reach the configured database"
  else
    echo "[warn] Alembic could not verify migration status yet"
    warnings=$((warnings + 1))
  fi
fi

echo ""
if [[ "$failures" -gt 0 ]]; then
  echo "verify_setup failed with ${failures} blocking issue(s) and ${warnings} warning(s)."
  exit 1
fi

echo "verify_setup passed with ${warnings} warning(s)."
