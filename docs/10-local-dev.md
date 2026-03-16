# Local Development

This page is the deeper reference for local macOS development. If you are installing tools for the first time, use the `Local macOS setup` section in [README.md](../README.md) first.

## Daily workflow

```bash
make verify_setup
make setup
make llm_local_setup
make dev
```

What these do:

- `make verify_setup`: checks required tools and versions
- `make setup`: installs backend deps, frontend deps, runs frontend GraphQL codegen, and applies local migrations when Docker is available
- `make llm_local_setup`: one-time local Qwen setup; installs optional local-inference deps and downloads about 4.5 GB into the normal Hugging Face cache
- `make dev`: starts the web app and API and keeps running in this terminal
- `make dev_stop`: stops leftover local processes if a dev session was interrupted

## What you should see

- Web app: `http://127.0.0.1:3000`
- API health: `http://127.0.0.1:8001/api/healthz`
- The first screen should be the Sign In page

## Local sign-in

- Default login domain allowlist: `example.com`
- In local mode, challenge code provider logs the code to API logs
- Development quick login is available on `/login`
- username: `admin`
- password: `local-dev-password`
- This shortcut is blocked outside local/test environments

## Local LLM

- Local development defaults to `LLM_PROVIDER=local_qwen`
- The default model is `Qwen/Qwen3.5-2B`
- Run `make llm_local_setup` once before `make dev`
- This downloads about 4.5 GB into the normal Hugging Face cache and does not require an API key
- `make dev` auto-starts the local Qwen runtime when `LLM_PROVIDER=local_qwen`
- The first summary request may take a while while the model loads into memory
- For deterministic tests or focused debugging, you can still set `LLM_PROVIDER=mock`

## Frontend note

- Frontend uses the Next.js Pages Router, Apollo Client, GraphQL codegen, shared design tokens, and Tailwind v4
- If you change frontend GraphQL operations, run:

```bash
cd apps/web && yarn codegen
```

- If backend GraphQL schema changes, refresh the schema snapshot first:

```bash
cd apps/web && yarn schema:refresh
cd apps/web && yarn codegen
```

- `yarn schema:refresh` expects the local API to be running on `127.0.0.1:8001`

## Environment overrides

- Optional overrides live in `.env` or `.env.local`
- Start from `.env.example` if you need custom values
- Never paste real secrets into AI chat or commit them to git

## Quality checks

- `make verify_setup`
- `make test`
- `make lint`
- `make typecheck`
- `make security`
