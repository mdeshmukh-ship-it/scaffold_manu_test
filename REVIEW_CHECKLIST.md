# REVIEW CHECKLIST

## Severity Guidance

- **L1**: prototype level, internal only.
- **L2**: internal production usage, must pass all automated checks.
- **L3**: public-facing or high-risk; professional reviewer approval is a hard gate.
- L3 baseline requires:
  - rate limiting on auth endpoints
  - bot protection toggle support
  - authz decision logging

## Builder / LLM Self-Check

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] `make typecheck` passes
- [ ] `make security` passes
- [ ] No secrets checked into git
- [ ] DB access uses `db.operation(...)` wrappers
- [ ] Outbound HTTP uses `outbound_http.request(...)`
- [ ] Logs include `request_id` and `user_email` where applicable
- [ ] Docs updated (`docs/*`, README, runbook)
- [ ] Auth bypass is local/test only

## Professional Reviewer Fast-Path

- [ ] Architecture follows scaffold conventions (backend/frontend/docs/scripts layout)
- [ ] Auth flow secure defaults verified (domain allowlist, challenge hashing, session TTL, logout revoke)
- [ ] Rate limiting behavior present and reasonable
- [ ] GraphQL mutation inputs validated by Pydantic
- [ ] REST endpoints using Pydantic request/response models
- [ ] Logging contract implemented (`http.request`, `db.operation`, `http.outbound`, `auth.event`, `authz.decision`)
- [ ] GCP bootstrap script is idempotent and scoped IAM is least-privilege reasonable
- [ ] CI runs required checks on PRs
