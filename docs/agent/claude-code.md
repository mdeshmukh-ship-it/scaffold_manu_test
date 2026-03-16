# Claude Code Playbook

## Project Memory

- See [CLAUDE.md](mdc:CLAUDE.md) for architecture, commands, and hard rules.
- Use [CLAUDE.md](mdc:CLAUDE.md) as the backend Python style source of truth.
- Use [CLAUDE.md](mdc:CLAUDE.md) as the frontend web style source of truth too.
- See [.claude/settings.json](mdc:.claude/settings.json) for permission policy.

## Permission Policy Intent

- Deny read/edit on `.env`, key material, and private key patterns.
- Allow setup and routine quality commands (`make verify_setup`, `make setup`, `make test`, `make lint`, etc.).
- Ask for all other shell commands and all `WebFetch` calls.
- Deny `curl`/`wget` to reduce silent network bypass.

## Secret Handling

- Do not paste real secrets into Claude chat.
- Use shell env vars locally and Secret Manager in deployed environments.
- If a secret was pasted by mistake:
  - rotate or revoke it immediately
  - remove any file copies
  - continue with the proper secret channel only

## Golden Prompt Template

```text
Follow CLAUDE.md strictly.
Implement CHANGE_X with tests first.
Use `make verify_setup` and `make setup` for onboarding steps.
Run quality checks via make targets first (make test/lint/typecheck/security).
Do not bypass db.operation or outbound_http wrappers.
Use `api/llm/client.py` for LLM calls and `api/tasks/base.py` for lightweight background jobs.
For backend Python code, follow the "Python Backend Style (3.13)" section in CLAUDE.md.
For frontend code, follow the "Frontend Web Style" section in CLAUDE.md:
- Pages Router only
- keep `apps/web/pages/*` thin and client-only
- Apollo Client for GraphQL app data and `requestApiJson()` for `/api/*`
- generated GraphQL types via `cd apps/web && yarn codegen`
- if backend GraphQL schema changes, refresh the schema snapshot with `cd apps/web && yarn schema:refresh` while the local API is running, then rerun `cd apps/web && yarn codegen`
- shared design tokens in `apps/web/styles/globals.css`
- prefer one obvious pattern over flexible abstractions
Only use direct uv/ruff/pytest commands for targeted debugging after a make command fails.
```
