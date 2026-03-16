# Scaffold App Template Monorepo

Build functional application prototypes with AI assistance from a safer, cleaner starting point. This scaffold gives new developers a working backend, a typed frontend, and a small set of commands and docs that make code review and deployment easier.

## Start Here

- Starting a real app? On GitHub, click `Use this template` to create your own repository first.
- Just evaluating the scaffold? You can clone or download this repository directly instead.
- Then follow [GETTING_STARTED.md](./GETTING_STARTED.md) for Replit, Cursor, or Claude Code.
- The default local LLM path uses `Qwen/Qwen3.5-2B`. Run `make llm_local_setup` once; it downloads about 4.5 GB into the normal Hugging Face cache and does not require an API key.
- Never paste API keys, passwords, or tokens into AI chat. Use your platform's secret tool instead.

## What This Repo Gives You

- Backend: Python 3.13, Tornado, Strawberry GraphQL, SQLAlchemy async, Alembic
- Frontend: Next.js Pages Router, Apollo Client, GraphQL codegen, shared design tokens, TypeScript, Tailwind v4
- Data: Postgres locally and in Cloud SQL, plus SQLite fallback for Replit/tests
- LLM: secret-free local Qwen runtime by default, with easy upgrade path to OpenAI or Anthropic
- Deploy: Docker + Cloud Run + Artifact Registry

## Local macOS setup (Cursor or Claude Code)

If you are using Cursor or Claude Code locally, expand this once and run it.

<details>
<summary>Show macOS prerequisite install commands</summary>

```bash
brew install python@3.13 uv nvm
mkdir -p ~/.nvm

cat <<'EOF' >> ~/.zshrc
export PATH="$(brew --prefix python@3.13)/libexec/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$(brew --prefix nvm)/nvm.sh" ] && \. "$(brew --prefix nvm)/nvm.sh"
[ -s "$(brew --prefix nvm)/etc/bash_completion.d/nvm" ] && \. "$(brew --prefix nvm)/etc/bash_completion.d/nvm"
EOF

exec zsh
nvm install 24
nvm use 24
corepack enable
brew install --cask docker
```

</details>

## Run locally (Cursor or Claude Code)

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
- Note summarization uses the local Qwen runtime; the first summary request may take longer while the model loads into memory

## Sign in locally

- Default path: email challenge login
- Quick local/test shortcut on `/login`
- username: `admin`
- password: `local-dev-password`
- This shortcut is blocked outside local/test environments

## Frontend note

- If you change frontend GraphQL operations, run `cd apps/web && yarn codegen`.
- If backend GraphQL schema changes, run `cd apps/web && yarn schema:refresh` with the local API running, then run `cd apps/web && yarn codegen`.
- Extend the shared tokens in `apps/web/styles/globals.css` rather than introducing one-off colors or extra CSS layers.

## Core commands

- `make verify_setup`
- `make setup`
- `make llm_local_setup`
- `make dev`
- `make dev_stop`
- `make test`
- `make lint`
- `make typecheck`
- `make security`
- `make build`
- `make deploy`

## Read next

- [Getting Started](./GETTING_STARTED.md)
- [Documentation Index](./docs/index.md)
- [Local Development](./docs/10-local-dev.md)
- [Review Checklist](./REVIEW_CHECKLIST.md)

## Release note

- L3 apps are hard-gated on engineer review.
