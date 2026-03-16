# Testing Patterns

## Goal

Use small, deterministic tests to drive changes with red/green TDD.

## Starter Files

- `apps/api/tests/conftest.py`: resets env/config/rate-limiter/runtime state between tests
- `apps/api/tests/test_graphql_notes.py`: endpoint-level GraphQL examples
- `apps/api/tests/test_async_examples.py`: async unit examples for LLM mocking

## Recommended Flow

1. Add or update a failing test.
2. Make the smallest code change that passes it.
3. Run:
   - `make test`
   - `make lint`
   - `make typecheck`
   - `make security`

## What To Copy

- GraphQL auth + mutation tests:
  - use `AsyncHTTPTestCase`
  - authenticate once, then call `/graphql`
- External API mocking:
  - monkeypatch the wrapper entry point, not raw HTTP libraries
  - for LLM work, patch `api.llm.client.outbound_request`

## Keep Tests Deterministic

- Use SQLite test databases unless behavior requires Postgres-specific coverage.
- Keep `LLM_PROVIDER=mock` for default app tests, even though local development now defaults to `local_qwen`.
- Avoid real network calls.
