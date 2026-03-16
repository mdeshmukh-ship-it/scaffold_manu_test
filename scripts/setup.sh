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

./scripts/verify_setup.sh

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

echo "Installing backend dependencies..."
(
  cd apps/api
  uv sync
)

echo "Installing frontend dependencies..."
(
  cd apps/web
  yarn install --frozen-lockfile
)

if command -v docker >/dev/null 2>&1; then
  echo "Starting local Postgres..."
  docker compose up -d db

  echo "Applying database migrations..."
  (
    cd apps/api
    uv run alembic upgrade head
  )
else
  echo "Docker not found; skipping local Postgres startup and migrations."
fi

echo ""
echo "Setup complete."
echo "Next steps:"
echo "  1. Review .env.example and create .env only if you need overrides."
echo "  2. Run make llm_local_setup once to enable the default local Qwen model (downloads about 4.5 GB)."
echo "  3. Run make dev"
echo "  4. If processes ever linger after an interrupted dev session, run make dev_stop"
echo "  5. Open http://127.0.0.1:3000"
