#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/APP_MANIFEST.yaml"

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "Project not set. Pass project id as first arg or set gcloud default project." >&2
  exit 1
fi

parse_manifest() {
  local key="$1"
  python3 - "$MANIFEST_PATH" "$key" <<'PY'
import re
import sys

manifest_path = sys.argv[1]
needle = sys.argv[2]
text = open(manifest_path, "r", encoding="utf-8").read()
pattern = re.compile(rf"^\s*{re.escape(needle)}:\s*\"?([^\n\"]+)\"?\s*$", re.MULTILINE)
match = pattern.search(text)
if match:
    print(match.group(1).strip())
PY
}

APP_SLUG="$(parse_manifest "slug")"
REGION="$(parse_manifest "region")"
SERVICE_NAME="$(parse_manifest "cloud_run_service")"
SQL_INSTANCE="$(parse_manifest "cloud_sql_instance")"
BUCKET_NAME="$(parse_manifest "gcs_bucket")"

APP_SLUG="${APP_SLUG:-scaffold-app}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-$APP_SLUG}"
SQL_INSTANCE="${SQL_INSTANCE:-${APP_SLUG}-pg}"

CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" --format='value(connectionName)' 2>/dev/null || true)"
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)' 2>/dev/null || true)"

echo "PROJECT_ID=${PROJECT_ID}"
echo "REGION=${REGION}"
echo "SERVICE_NAME=${SERVICE_NAME}"
echo "SERVICE_URL=${SERVICE_URL:-<not-deployed>}"
echo "CLOUD_SQL_INSTANCE=${SQL_INSTANCE}"
echo "INSTANCE_CONNECTION_NAME=${CONNECTION_NAME:-<not-found>}"
echo "GCS_BUCKET=${BUCKET_NAME:-AUTO}"
echo ""
echo "Secrets:"
echo "  ${APP_SLUG}-db-name"
echo "  ${APP_SLUG}-db-user"
echo "  ${APP_SLUG}-db-password"
echo "  ${APP_SLUG}-session-secret"
echo "  ${APP_SLUG}-scheduler-shared-token"
echo "  ${APP_SLUG}-email-provider-key"
echo "  ${APP_SLUG}-sms-provider-key"
echo "  ${APP_SLUG}-bot-provider-key"
echo "  ${APP_SLUG}-openai-api-key"
echo "  ${APP_SLUG}-anthropic-api-key"