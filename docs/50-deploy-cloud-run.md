# Deploy To Cloud Run

## 1) Bootstrap GCP Resources

Run once per project (idempotent):

```bash
./scripts/gcp_bootstrap.sh --project YOUR_PROJECT_ID
```

This script enables APIs and provisions:

- Artifact Registry repo
- Cloud Run runtime service account
- Cloud SQL instance + DB + DB user
- Secret Manager placeholders + generated secrets
- GCS bucket with uniform access + public access prevention
- Optional scheduler + LLM secret placeholders

## 2) Build And Push Image

```bash
make build
```

Use the script output deploy template to push and deploy.

## 3) Deploy Service

Use the command template printed by bootstrap and adjust image tag as needed.

## 4) Post-Deploy Validation

- Hit `/api/healthz`
- Sign in on `/login`
- Create/list notes on `/`
- Wire a real provider secret before testing note summarization in Cloud Run
- `local_qwen` is intended for local/Replit prototyping, not the default Cloud Run path
- Confirm logs in Cloud Logging for:
  - `http.request`
  - `db.operation`
  - `http.outbound`

## Optional Cloud Scheduler

- Protect scheduled endpoints with `SCHEDULER_SHARED_TOKEN`
- Example sample endpoint:
  - `POST /api/tasks/note-summary/run`
- Store the token in Secret Manager and map it into Cloud Run at deploy time
