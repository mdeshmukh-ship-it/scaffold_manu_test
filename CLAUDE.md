# Project Memory For Claude Code

## Architecture Summary

- Monorepo with Python API in `apps/api` and a Next.js Pages Router web app in `apps/web`.
- API stack: Tornado + Strawberry GraphQL + SQLAlchemy async ORM + Alembic.
- Auth stack: challenge-code login + server-side session table + HttpOnly cookie.
- Logging stack: structured JSON logs with request context and logical operation names.
- LLM stack: provider-agnostic wrapper in `apps/api/src/api/llm/client.py` with `local_qwen` default and `mock` retained for tests.
- Task stack: tracked background helper in `apps/api/src/api/tasks/base.py`.

## Golden Commands

- Setup verification: `make verify_setup`
- Setup/install: `make setup`
- Local LLM setup: `make llm_local_setup`
- Local dev: `make dev`
- Tests: `make test`
- Lint: `make lint`
- Typecheck: `make typecheck`
- Security checks: `make security`

## Definition Of Done

Before marking a task complete, all of these must pass:

- `make test`
- `make lint`
- `make typecheck`
- `make security`
- Prefer running these Make targets instead of direct `uv`/`ruff`/`pytest` commands.
- Use direct tool commands only for focused debugging after a Make target fails.

## Non-Negotiable Rules

- Never add auth bypass paths outside `APP_ENV=local` or `APP_ENV=test`.
- Never log secrets, bearer tokens, raw session tokens, or private key material.
- Never bypass `db.operation(...)` for DB access.
- Never bypass `outbound_http.request(...)` for external HTTP calls.
- Never call LLM providers directly; use `api/llm/client.py`.
- Never hand-roll fire-and-forget jobs when `api/tasks/base.py` fits.
- Keep GraphQL-first API design unless REST is clearly better (health/auth/upload-signing).

## Python Backend Style (3.13)

### Philosophy

- Readability wins: optimize for the next engineer reading the code.
- Local consistency over global consistency: match the file/service style you are editing.
- Keep diffs small: avoid unrelated formatting/renaming churn.
- Use PEP-8 as a baseline, but prefer readability if there is a clear tradeoff.
- This scaffold uses Ruff line length 120 to keep prompt-heavy modules readable.

### Imports

- Group imports with blank lines between groups:
  1) standard library
  2) third-party
  3) repo-local
- Keep imports explicit and grep-friendly; prefer one import per line.
- Avoid shadowing modules with instances (`redis_client`, not `redis`).

### Naming

- `snake_case` for functions/variables.
- `CapWords` for classes.
- `UPPER_SNAKE_CASE` for constants.
- Prefer explicit names over abbreviations.

### Typing

- Type public and external-facing functions.
- Keep types honest and simple.
- Prefer built-in generics and unions in new code:
  - `list[str]`, `dict[str, int]`, `X | None`
- Avoid heavyweight typing unless it clearly improves correctness/maintainability.

### Configuration and env vars

- Use centralized config in [settings.py](mdc:apps/api/src/api/settings.py) when possible.
- If env vars are read directly, parse once and coerce types explicitly.
- Required config should fail fast; optional config should have explicit defaults.

### Logging and errors

- Prefer clear f-string messages.
- In `except` blocks, use `logger.exception(...)` (or `logging.exception(...)`) when stack trace context helps.
- Catch specific exceptions (or `Exception`) and say what failed.
- A bare `except:` is only acceptable as rare boundary-level redundancy and must not silently swallow failures.
- Never log secrets.

### Documentation comments

- For non-trivial/non-obvious classes or functions, include a one-line purpose comment:
  - `''' Extract financial metrics '''`
- Tense conventions:
  - Classes: active present tense (`''' Extracts financial metrics '''`)
  - Functions: imperative tense (`''' Extract financial metrics '''`)
- Prefer documenting intent, invariants, and side effects rather than obvious line-by-line behavior.

### TODO / XXX / NB

- `TODO:` intentional follow-up work
- `XXX:` temporary migration workaround
- `NB:` one-sentence explanation for logic that is hard to read
- Include enough context so future engineers can safely resolve/remove comments.

### Modernization guidance (3.13)

- Use `super()` over legacy `super(Class, self)`.
- Prefer `X | None` over `Optional[X]` in new code.
- Prefer `pathlib.Path` for file path composition in new code.
- Use `match` where it makes multi-branch logic clearer than `if/elif`.

## Frontend Web Style

- Use Yarn in `apps/web`.
- Use Next.js Pages Router only. Do not add App Router files, middleware, API routes, server components, `getServerSideProps`, or `getStaticProps`.
- Keep `apps/web/pages/*` thin and client-only. Put UI in `apps/web/components/*`, reusable client logic in `apps/web/hooks/*`, browser helpers in `apps/web/lib/*`, and Apollo setup in `apps/web/clients/*`.
- Use Apollo Client for GraphQL app data. Use `requestApiJson()` for browser calls to `/api/*`.
- Keep browser requests same-origin and limited to scaffold backend endpoints.
- Keep GraphQL operations strongly typed:
  - operation files live in `apps/web/components`, `apps/web/hooks`, or `apps/web/pages`
  - generated files live next to operations and in `apps/web/__generated_types__`
  - run `cd apps/web && yarn codegen` after frontend GraphQL operation changes
  - if backend GraphQL schema changes, run `cd apps/web && yarn schema:refresh` with the local API running, then rerun `cd apps/web && yarn codegen`
  - never hand-edit `*.generatedTypes.ts`
- Use shared design tokens from `apps/web/styles/globals.css`, imported only in `apps/web/pages/_app.tsx`.
- Keep shared primitives in `apps/web/components/generic`, but only when they reduce repetition without hiding behavior.
- If icons are needed, use `lucide-react`. Do not add a second icon library.
- Prefer one obvious pattern over flexible abstractions. Keep the default app small and readable.
- Prefer `@/*` imports, clear names, browser APIs, and no premature memoization.

## Perennial Data Reference

When working on portfolio data, returns, holdings, or client reporting features, consult these guides in `docs/`:

- **`docs/perennial_assistant_quick_reference.md`** — START HERE. Working queries with correct field names for daily account activity, realized/unrealized gains by account type, dividend/interest data, and account-level performance metrics. Includes key gotchas (field casing, typos, deduplication, PIMCO UNION pattern).
- `docs/perennial_business_context.md` — Client hierarchy (Family → Entity → Account), account type classification, data sources, Perennial funds (VC/DI/RA), investment earnings formula, date logic, asset classification rules.
- `docs/perennial_etl_workflows.md` — Liquid returns ETL (daily TWROR for Fidelity SMA accounts) and private returns ETL (TWROR for VC fund entities from SS&C data). Covers inputs, calculation pipeline, output tables, and edge cases.
- `docs/perennial_table_relationships_and_query_patterns.md` — Pre-computed reporting views (recommended for client reports), source table relationship map, validated SQL query patterns for all common operations (market values, returns, holdings, asset allocation, fund summaries, benchmarks).
- `docs/perennial_table_schema_reference.md` — Complete column-level reference for all 101 tables across 12 datasets in `perennial-data-prod` BigQuery.

Always prefer the `reporting.*` views for client-facing queries. Use source tables only for ad-hoc analysis or custom calculations not covered by reporting views.

### Key Data Access Rules
- **Activity data:** Use `reporting.daily_account_activity` (snake_case fields: `deposits`, `withdrawals`, `dividends`, `interest`, `fees`, `option_premium`, `net_flows`).
- **Realized/unrealized gains:** Use `parametric.portfolio_data` for Equity accounts, `quantinno.account_summary` for Long-Short accounts, or `reporting.account_type_summaries` for unified key-value access.
- **Performance metrics:** Use `reporting.account_returns` for account-level TWROR, `reporting.entity_returns` for entity-level, `reporting.family_returns` for family-level. For tax alpha, join `parametric.portfolio_performance`.
- **Dividends & interest:** Use `reporting.daily_account_activity` (daily) or `reporting.account_monthly_activity` (monthly rollup).

## Mistake Log

If an agent makes a serious mistake, add a short entry:

- Date
- What happened
- Why it happened
- Preventive guardrail added
