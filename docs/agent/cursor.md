# Cursor Playbook

## Goals

- Keep changes small, reviewable, and tested.
- Use scaffold primitives instead of ad-hoc patterns.
- Keep backend Python style aligned with [10-backend.mdc](mdc:.cursor/rules/10-backend.mdc).
- Keep frontend work aligned with [20-frontend.mdc](mdc:.cursor/rules/20-frontend.mdc).
- Keep secrets out of chat; use local env vars or your deployment secret manager.

## Golden Prompt Template

Use this for feature work:

```text
Implement FEATURE_X using existing scaffold primitives.
Requirements:
1) Start with make verify_setup and make setup if environment prep is needed.
2) Add tests first (red/green).
3) Use db.operation for DB work.
4) Use outbound_http.request for external calls.
5) Use api/llm/client.py for LLM calls and api/tasks/base.py for lightweight background jobs.
6) For frontend work, use Pages Router only, keep `apps/web/pages/*` thin, use Apollo Client for `/graphql`, use `requestApiJson()` for `/api/*`, extend shared tokens in `apps/web/styles/globals.css`, run `cd apps/web && yarn codegen` after frontend GraphQL operation changes, and if backend GraphQL schema changes run `cd apps/web && yarn schema:refresh` with the local API running before rerunning `cd apps/web && yarn codegen`.
7) Ensure authz decisions are logged.
8) Follow backend style philosophy in .cursor/rules/10-backend.mdc and frontend rules in .cursor/rules/20-frontend.mdc.
9) Run make test lint typecheck security.
```

## Cursor Rule Files

- [00-workflow.mdc](mdc:.cursor/rules/00-workflow.mdc)
- [10-backend.mdc](mdc:.cursor/rules/10-backend.mdc)
- [20-frontend.mdc](mdc:.cursor/rules/20-frontend.mdc)
- [30-tests.mdc](mdc:.cursor/rules/30-tests.mdc)
- [40-security.mdc](mdc:.cursor/rules/40-security.mdc)
- [50-logging.mdc](mdc:.cursor/rules/50-logging.mdc)
