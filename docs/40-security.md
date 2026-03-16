# Security Guidelines

## Baseline Rules

- Never commit secrets (`.env`, key files, private certs).
- Never log secrets, auth tokens, cookies, or plaintext challenge codes in production.
- Validate every external input (REST + GraphQL mutation input).
- Keep auth/session/rate-limit settings explicit by environment.

## Secret Handling Contract

- Agents should ask for secret **names** and intended use, not secret **values** in chat.
- Secret values belong in the platform's secure channel:
  - Replit: Replit Secrets / `requestEnvVar`
  - Local Cursor/Claude workflows: shell env vars or user-managed `.env` file
  - Cloud deploys: GCP Secret Manager
- Runtime code should read secrets from env/secret managers only.
- Use `python3 scripts/check_secrets.py` or `make security` as a backstop, not as permission to paste secrets casually.

## If A Secret Was Shared Incorrectly

- Stop using that secret immediately.
- Rotate or revoke it in the provider dashboard.
- Remove it from files, chat follow-ups, screenshots, and shell history if possible.
- Re-add it through the correct secret channel for your tool.
- Re-run `make security` before sharing your work.

## Automation Requirements

- Backend: `pip-audit`, `ruff` security rules
- Frontend: `cd apps/web && yarn audit --level high --groups dependencies`
- Always run:
  - `make test`
  - `make lint`
  - `make typecheck`
  - `make security`

## Authorization

- Authz policy is app-specific.
- Every decision (allow/deny) must be logged via `audit.log_authz_decision`.

## L3 Hardening Checklist

- Bot protection enabled and tested.
- Tightened auth rate limits.
- Professional reviewer signoff complete.
