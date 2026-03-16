#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/APP_MANIFEST.yaml"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required. Install Google Cloud SDK first." >&2
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "No active gcloud account found. Run: gcloud auth login" >&2
  exit 1
fi

PROJECT_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ID" ]]; then
  echo "No GCP project selected. Use --project or run: gcloud config set project <PROJECT_ID>" >&2
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
ARTIFACT_REPO="$(parse_manifest "artifact_registry_repo")"
CLOUD_RUN_SERVICE="$(parse_manifest "cloud_run_service")"
CLOUD_SQL_INSTANCE="$(parse_manifest "cloud_sql_instance")"
BUCKET_FROM_MANIFEST="$(parse_manifest "gcs_bucket")"

APP_SLUG="${APP_SLUG:-scaffold-app}"
REGION="${REGION:-us-central1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-apps}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-$APP_SLUG}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${APP_SLUG}-pg}"
BUCKET_FROM_MANIFEST="${BUCKET_FROM_MANIFEST:-AUTO}"

RUN_SA_NAME="${APP_SLUG}-run-sa"
RUN_SA_EMAIL="${RUN_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DB_NAME="${APP_SLUG//-/_}"
DB_USER="${APP_SLUG//-/_}_app"

random_secret() {
  python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
}

ensure_api_enabled() {
  local api="$1"
  if gcloud services list --enabled --project "$PROJECT_ID" --filter="config.name:${api}" --format='value(config.name)' | grep -q "$api"; then
    echo "[skip] API already enabled: $api"
  else
    echo "[create] Enabling API: $api"
    gcloud services enable "$api" --project "$PROJECT_ID" >/dev/null
  fi
}

ensure_secret_with_value() {
  local secret_name="$1"
  local secret_value="$2"
  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "[skip] Secret exists: $secret_name"
  else
    echo "[create] Secret: $secret_name"
    printf "%s" "$secret_value" | gcloud secrets create "$secret_name" \
      --project "$PROJECT_ID" \
      --replication-policy="automatic" \
      --data-file=- >/dev/null
  fi
}

ensure_empty_secret() {
  local secret_name="$1"
  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "[skip] Secret exists: $secret_name"
  else
    echo "[create] Empty secret placeholder: $secret_name"
    printf "" | gcloud secrets create "$secret_name" \
      --project "$PROJECT_ID" \
      --replication-policy="automatic" \
      --data-file=- >/dev/null
  fi
}

echo "Using project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

for api in \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com
do
  ensure_api_enabled "$api"
done

if gcloud artifacts repositories describe "$ARTIFACT_REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Artifact Registry repo exists: $ARTIFACT_REPO"
else
  echo "[create] Artifact Registry repo: $ARTIFACT_REPO"
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format=docker >/dev/null
fi

if gcloud iam service-accounts describe "$RUN_SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Service account exists: $RUN_SA_EMAIL"
else
  echo "[create] Service account: $RUN_SA_EMAIL"
  gcloud iam service-accounts create "$RUN_SA_NAME" \
    --project "$PROJECT_ID" \
    --display-name "${APP_SLUG} Cloud Run Runtime SA" >/dev/null
fi

if gcloud sql instances describe "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Cloud SQL instance exists: $CLOUD_SQL_INSTANCE"
else
  echo "[create] Cloud SQL instance: $CLOUD_SQL_INSTANCE"
  gcloud sql instances create "$CLOUD_SQL_INSTANCE" \
    --project "$PROJECT_ID" \
    --database-version=POSTGRES_16 \
    --region="$REGION" \
    --cpu=1 \
    --memory=3840MiB \
    --storage-size=20 \
    --storage-type=SSD >/dev/null
fi

if gcloud sql databases describe "$DB_NAME" --instance "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Database exists: $DB_NAME"
else
  echo "[create] Database: $DB_NAME"
  gcloud sql databases create "$DB_NAME" \
    --instance "$CLOUD_SQL_INSTANCE" \
    --project "$PROJECT_ID" >/dev/null
fi

DB_PASSWORD="$(random_secret)"
if gcloud sql users list --instance "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" --format='value(name)' | grep -q "^${DB_USER}$"; then
  echo "[skip] DB user exists: $DB_USER"
else
  echo "[create] DB user: $DB_USER"
  gcloud sql users create "$DB_USER" \
    --instance "$CLOUD_SQL_INSTANCE" \
    --password "$DB_PASSWORD" \
    --project "$PROJECT_ID" >/dev/null
fi

ensure_secret_with_value "${APP_SLUG}-db-name" "$DB_NAME"
ensure_secret_with_value "${APP_SLUG}-db-user" "$DB_USER"
ensure_secret_with_value "${APP_SLUG}-db-password" "$DB_PASSWORD"
ensure_secret_with_value "${APP_SLUG}-session-secret" "$(random_secret)"
ensure_secret_with_value "${APP_SLUG}-scheduler-shared-token" "$(random_secret)"
ensure_empty_secret "${APP_SLUG}-email-provider-key"
ensure_empty_secret "${APP_SLUG}-sms-provider-key"
ensure_empty_secret "${APP_SLUG}-bot-provider-key"
ensure_empty_secret "${APP_SLUG}-openai-api-key"
ensure_empty_secret "${APP_SLUG}-anthropic-api-key"

if [[ "$BUCKET_FROM_MANIFEST" == "AUTO" ]]; then
  BUCKET_NAME="${PROJECT_ID}-${APP_SLUG}-$(date +%s)-$RANDOM"
  BUCKET_NAME="$(echo "$BUCKET_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
else
  BUCKET_NAME="$BUCKET_FROM_MANIFEST"
fi

if gcloud storage buckets describe "gs://${BUCKET_NAME}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[skip] Bucket exists: gs://${BUCKET_NAME}"
else
  echo "[create] Bucket: gs://${BUCKET_NAME}"
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention >/dev/null
fi

gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --project "$PROJECT_ID" \
  --uniform-bucket-level-access \
  --public-access-prevention >/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${RUN_SA_EMAIL}" \
  --role "roles/cloudsql.client" >/dev/null

for secret in \
  "${APP_SLUG}-db-name" \
  "${APP_SLUG}-db-user" \
  "${APP_SLUG}-db-password" \
  "${APP_SLUG}-session-secret" \
  "${APP_SLUG}-scheduler-shared-token" \
  "${APP_SLUG}-email-provider-key" \
  "${APP_SLUG}-sms-provider-key" \
  "${APP_SLUG}-bot-provider-key" \
  "${APP_SLUG}-openai-api-key" \
  "${APP_SLUG}-anthropic-api-key"
do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project "$PROJECT_ID" \
    --member "serviceAccount:${RUN_SA_EMAIL}" \
    --role "roles/secretmanager.secretAccessor" >/dev/null
done

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --member "serviceAccount:${RUN_SA_EMAIL}" \
  --role "roles/storage.objectAdmin" >/dev/null

INSTANCE_CONNECTION_NAME="$(gcloud sql instances describe "$CLOUD_SQL_INSTANCE" --project "$PROJECT_ID" --format='value(connectionName)')"

echo ""
echo "Bootstrap complete."
echo ""
echo "Cloud Run deploy template:"
echo "gcloud run deploy ${CLOUD_RUN_SERVICE} \\"
echo "  --project ${PROJECT_ID} \\"
echo "  --region ${REGION} \\"
echo "  --service-account ${RUN_SA_EMAIL} \\"
echo "  --set-secrets SESSION_SECRET=${APP_SLUG}-session-secret:latest,CLOUD_SQL_DB_NAME=${APP_SLUG}-db-name:latest,CLOUD_SQL_DB_USER=${APP_SLUG}-db-user:latest,CLOUD_SQL_DB_PASSWORD=${APP_SLUG}-db-password:latest \\"
echo "  --set-env-vars APP_ENV=prod,CLOUD_SQL_INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME},GCS_BUCKET=${BUCKET_NAME} \\"
echo "  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${APP_SLUG}:latest"
echo ""
echo "Optional deploy flags for LLM + scheduler features:"
echo "  --set-secrets OPENAI_API_KEY=${APP_SLUG}-openai-api-key:latest,ANTHROPIC_API_KEY=${APP_SLUG}-anthropic-api-key:latest,SCHEDULER_SHARED_TOKEN=${APP_SLUG}-scheduler-shared-token:latest"
echo ""
echo "Environment summary:"
echo "  PROJECT_ID=${PROJECT_ID}"
echo "  REGION=${REGION}"
echo "  INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME}"
echo "  CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE}"
echo "  CLOUD_SQL_DB_NAME=${DB_NAME}"
echo "  CLOUD_SQL_DB_USER=${DB_USER}"
echo "  GCS_BUCKET=${BUCKET_NAME}"
echo ""
echo "Secrets:"
echo "  ${APP_SLUG}-db-name"
echo "  ${APP_SLUG}-db-user"
echo "  ${APP_SLUG}-db-password"
echo "  ${APP_SLUG}-session-secret"
echo "  ${APP_SLUG}-scheduler-shared-token"
echo "  ${APP_SLUG}-email-provider-key (placeholder)"
echo "  ${APP_SLUG}-sms-provider-key (placeholder)"
echo "  ${APP_SLUG}-bot-provider-key (placeholder)"
echo "  ${APP_SLUG}-openai-api-key (placeholder)"
echo "  ${APP_SLUG}-anthropic-api-key (placeholder)"
echo ""
echo "Success checklist:"
echo "  [ ] Build and push image to Artifact Registry"
echo "  [ ] Deploy Cloud Run with Cloud SQL + secrets"
echo "  [ ] Run database migrations"
echo "  [ ] Visit /api/healthz and confirm {\"ok\": true}"
