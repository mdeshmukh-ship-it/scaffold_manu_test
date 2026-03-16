# Architecture Overview

## Mission

This scaffold helps less-technical builders prototype quickly while preserving professional standards for security, reliability, and reviewability.

## Monorepo Layout

- `apps/api`: Tornado + GraphQL backend
- `apps/web`: Next.js Pages Router frontend with Apollo Client, codegen, and Tailwind v4
- `docs`: operational and development docs
- `scripts`: local/devops helper scripts

## Golden Path

1. Build feature with tests first.
2. Run `make test lint typecheck security`.
3. Validate logs and docs updates.
4. Deploy using `scripts/gcp_bootstrap.sh` + Cloud Run deploy template.

## Platform Primitives

- DB logical operations: `db.operation("domain.action")`
- Outbound HTTP wrapper: `outbound_http.request(...)`
- LLM wrapper: `api/llm/client.py`
- Background task helper: `api/tasks/base.py`
- Structured logging + request context middleware
- Auth challenge flow + server-side sessions + rate limiting
- Authz decision logging helper: `audit.log_authz_decision(...)`
