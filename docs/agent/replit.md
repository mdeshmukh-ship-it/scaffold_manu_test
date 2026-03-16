# Replit Playbook

## Runtime Model

- `.replit` uses `scripts/replit_run.sh`.
- `replit.nix` installs Python 3.13, Node.js 24 LTS, and `uv`.
- Frontend package manager is Yarn (enabled through Corepack in the scaffold scripts).
- Default DB in Replit mode is SQLite unless `DATABASE_URL` is provided via Secrets.
- Default LLM mode in Replit is `local_qwen`; `scripts/replit_run.sh` auto-starts the local runtime when `LLM_PROVIDER=local_qwen`.

## Import Paths

- Recommended: import zip from `https://github.com/a16z/scaffold/archive/refs/heads/main.zip` using **Import from Code**.
- Advanced only: GitHub import for a repo created from this template.
- Avoid linking directly to `a16z/scaffold` unless you understand the sync and access implications.

## Secrets

Use Replit Secrets for runtime env vars (for example):

- `SESSION_SECRET`
- `AUTH_ALLOWED_EMAIL_DOMAINS`
- `DATABASE_URL` (optional Postgres)
- provider keys (email/SMS/bot) as needed
- hosted LLM keys only if you switch away from `local_qwen`

Secret-handling rule for Replit Agent:

- Never ask users to paste secrets directly into chat.
- Always request secrets through Replit's env-var workflow (for example `requestEnvVar`) so values are stored in Replit Secrets.
- Suggested instruction users can paste:
  - `Use requestEnvVar/Replit Secrets for all secrets; do not request API keys in chat text.`
- If a real secret was pasted already:
  - revoke or rotate it immediately
  - move it into Replit Secrets
  - continue only with the secret workflow

## Authentication for new-developer setup

- Email challenge auth remains available.
- If email auth is blocked (for example domain mismatch), use Development Quick Login on `/login`:
  - username: `admin`
  - password: `local-dev-password`
- This credential path is available only in local/test environments and is blocked in production.

## Local Qwen setup

- Before clicking Replit `Run`, open the Shell and run:
  - `make llm_local_setup`
- This installs the optional local-inference dependencies and downloads about 4.5 GB into the normal Hugging Face cache.
- After setup, Replit `Run` auto-starts the local Qwen runtime, API, and web app together.
- The first summary request may take a while while the model loads into memory.

## Parallel Workflows Guidance

Preferred setup is three workflows when you need to debug each service directly:

1. Local LLM workflow:
   - `make llm_local_start`
2. API workflow:
   - `cd apps/api && uv run python -m api.main`
3. Web workflow:
   - `cd apps/web && yarn dev --hostname 0.0.0.0 --port 3000`

Or use unified run:

```bash
bash scripts/replit_run.sh
```

## Frontend Guardrails

- Keep frontend work in the Pages Router (`pages`), not the App Router.
- Keep pages thin and client-only; move real UI into `components/*`, reusable client logic into `hooks/*`, and browser helpers into `lib/*`.
- Use Apollo Client for GraphQL app data and `requestApiJson()` for browser calls to `/api/*`.
- Keep generated GraphQL types up to date with `cd apps/web && yarn codegen`.
- If backend GraphQL schema changes, run `cd apps/web && yarn schema:refresh` while the local API is running, then rerun `cd apps/web && yarn codegen`.
- Extend the shared design tokens in `styles/globals.css` and keep custom CSS minimal.
