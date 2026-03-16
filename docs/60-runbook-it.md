# IT Runbook

## Health Verification

- API health endpoint: `/api/healthz`
- Expect HTTP 200 with `{"ok": true, ...}`

## Key Operational Checks

- Request volume and status codes via `http.request`
- Slow or failing logical DB operations via `db.operation`
- External dependency failures via `http.outbound`
- Auth anomalies via `auth.event`
- Access denials via `authz.decision`
- Background task failures via `app.event` filtered to task operations

## Cloud Logging Queries

DB operation failures:

```text
jsonPayload.event_type="db.operation"
jsonPayload.ok=false
```

Outbound API failures:

```text
jsonPayload.event_type="http.outbound"
jsonPayload.ok=false
```

Auth failures:

```text
jsonPayload.event_type="auth.event"
jsonPayload.outcome!="success"
```

Background task failures:

```text
jsonPayload.event_type="app.event"
jsonPayload.message="background task failed"
```

## Environment Printing Helper

Use:

```bash
./scripts/gcp_print_env.sh YOUR_PROJECT_ID
```

This prints service URL, SQL connection name, secret names, and bucket info.
