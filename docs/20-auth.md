# Authentication Model

## Baseline Flow

1. `POST /api/auth/start` with email (+ optional bot token for L3).
2. User receives challenge code through configured provider.
3. `POST /api/auth/verify` with email + code.
4. API creates server-side session and sets HttpOnly cookie.
5. `POST /api/auth/logout` revokes session server-side.

## Security Defaults

- Login codes are hashed at rest.
- Codes expire quickly (default 10 minutes).
- Verify attempts are capped and rate limited.
- Sessions are opaque, hashed server-side, and revocable.
- Allowed sign-ins are restricted by:
  - `AUTH_ALLOWED_EMAIL_DOMAINS`
  - optional `AUTH_ALLOWED_EMAILS`

## Dev Bypass

- `DEV_AUTH_BYPASS=true` is allowed only in local/test.
- Production use is explicitly blocked.

## Development Quick Login (Local/Test Only)

- Endpoint: `POST /api/auth/password-login`
- Default credentials:
  - username: `admin`
  - password: `local-dev-password`
- This flow is intended only for new-developer onboarding in local/test environments and is blocked in production.

## Bot Protection

- Toggle with `BOT_PROTECTION_ENABLED=true`.
- Enforced when app severity is L3.
- Provider is pluggable (`turnstile` baseline implemented).
