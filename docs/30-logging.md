# Logging Contract

All logs are structured JSON to stdout and are intended for Cloud Logging ingestion.

## Required Event Types

- `http.request`
- `db.operation`
- `http.outbound`
- `auth.event`
- `authz.decision`

## Minimum Fields

- `event_type`
- `message`
- `severity`
- `request_id`
- `user_email` (nullable)
- `op` (logical operation name, when applicable)
- `duration_ms` (when applicable)
- `ok`

## DB Logging

- Use `async with db.operation("name") as op: ...`
- Do not log every SQL statement by default.
- Each logical operation emits one `db.operation` event with duration and outcome.

## Outbound HTTP Logging

- Always call external services through `outbound_http.request(...)`.
- Headers and payloads are redacted with key/header sensitive patterns.
- Payload logging is capped to reduce leak risk/noise.

## Example Cloud Logging Queries

Find DB operations:

```text
jsonPayload.event_type="db.operation"
```

Find outbound calls:

```text
jsonPayload.event_type="http.outbound"
```

Find denied authz decisions:

```text
jsonPayload.event_type="authz.decision"
jsonPayload.allowed=false
```
