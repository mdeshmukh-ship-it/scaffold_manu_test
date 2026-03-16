# Getting Started (Cursor, Claude Code, Replit)

This guide helps you do three things:

1. Make your own copy of the scaffold
2. Get it running
3. Hand it to your AI tool in a clean way

Template repo: `https://github.com/a16z/scaffold`

## Choose your path

- Replit: fastest start, no local tool install
- Cursor: local macOS with a desktop editor
- Claude Code: local macOS with a terminal agent

## Important rules

- Never paste API keys, passwords, or tokens into AI chat.
- Use Replit Secrets, shell environment variables, `.env` / `.env.local`, or GCP Secret Manager instead.
- If a real secret was pasted by mistake: rotate or revoke it, remove it from files and follow-up messages, move it into the right secret tool, then run `make security`.
- If you are using Cursor or Claude Code locally on macOS, first run the `Local macOS setup` block in [README.md](./README.md).
- The default local LLM path uses `Qwen/Qwen3.5-2B`. Run `make llm_local_setup` once before the default app tries to summarize notes; it downloads about 4.5 GB into the normal Hugging Face cache and does not require an API key.

## Step 1: Make your own copy of the scaffold

If you are starting a real app:

1. Open `https://github.com/a16z/scaffold`
2. Click `Use this template`
3. Create a new repository for your app
4. Use your new repository in the tool-specific steps below

If you are only evaluating the scaffold:

- You can clone or download `a16z/scaffold` directly
- Prefer that path only for short experiments, not long-lived app work

## Step 2: Choose a setup path

<details>
<summary>Replit (fastest, no local setup)</summary>

### Start from the right repo

- Real app: use your own repository created from the template
- Quick evaluation: use `a16z/scaffold`

### Import into Replit

1. Open the repository you want to use on GitHub
2. Click `Code` -> `Download ZIP`
3. In Replit, choose **Import from Code**
4. Upload the zip and create your Repl
5. Advanced only: if you prefer direct GitHub import, import your own repository, not `a16z/scaffold`

### Add secrets only if you need them

- Put environment variables in Replit **Secrets**
- If Replit Agent asks for secret values in chat, tell it to use `requestEnvVar` / Replit Secrets instead
- This scaffold defaults to SQLite in Replit mode unless `DATABASE_URL` is provided

### One-time local LLM setup

- Open the Replit Shell
- Run `make llm_local_setup`
- This installs the optional local-inference dependencies and downloads about 4.5 GB into the normal Hugging Face cache
- After it finishes, click **Run**

### Run the app

- Click **Run**
- This repo includes `.replit` + `scripts/replit_run.sh` for startup

### What you should see

- A running web app
- The Sign In page
- Note summarization uses the local Qwen runtime; the first summary request may take longer while the model loads into memory
- If email challenge login returns HTTP 403, use the development quick login on `/login`
- username: `admin`
- password: `local-dev-password`
- This shortcut is limited to local/test environments

### Before you move on

- Continue below to `Step 3: Build your app`

</details>

<details>
<summary>Cursor (local macOS, desktop editor)</summary>

### Clone the repo you want to use

- Real app:

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git your-app-folder
cd your-app-folder
```

- Quick evaluation only:

```bash
git clone https://github.com/a16z/scaffold your-app-folder
cd your-app-folder
```

### Open the repo in Cursor

- Cursor -> **File** -> **Open Folder...**
- Select your repo
- Wait for indexing to finish before prompting

### Run these commands

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

### What you should see

- Keep this terminal open while the app is running
- Open `http://127.0.0.1:3000`
- The first screen should be the Sign In page
- Note summarization uses the local Qwen runtime; the first summary request may take longer while the model loads into memory
- If a previous dev session was interrupted or left processes behind, run `make dev_stop`

### Before you move on

- Continue below to `Step 3: Build your app`

</details>

<details>
<summary>Claude Code (local macOS, terminal agent)</summary>

### Clone the repo you want to use

- Real app:

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git your-app-folder
cd your-app-folder
```

- Quick evaluation only:

```bash
git clone https://github.com/a16z/scaffold your-app-folder
cd your-app-folder
```

### Start Claude Code

From the repo root:

```bash
claude
```

If `claude` is missing, finish setup from the Claude Code quickstart docs first.

### Run these commands

```bash
make verify_setup
make setup
make llm_local_setup
make dev
```

### What you should see

- Keep this terminal open while the app is running
- Open `http://127.0.0.1:3000`
- The first screen should be the Sign In page
- Note summarization uses the local Qwen runtime; the first summary request may take longer while the model loads into memory
- If a previous dev session was interrupted or left processes behind, run `make dev_stop`

### Before you move on

- Continue below to `Step 3: Build your app`

</details>

## Step 3: Build your app

Use these prompts in any tool after the app starts successfully.

### Prompt 1: Rename + understand the codebase
Replace `YOUR_NAME_HERE` with your application's name and submit the following prompt.
```text
I need you to update this minimal application to add new functionality. I want to rename the application YOUR_NAME_HERE. Read through the repository to thoroughly familiarize yourself with the existing conventions and logic, and then update the application name in all relevant locations. I will follow up with a more complete description of the new features.
```

### Prompt 2: Implement your product spec
Replace `YOUR_REQUIREMENTS_HERE` with your product requirements and submit the following prompt. If you do not have a requirements doc, you can use this [PRD interview tool](https://chatgpt.com/g/g-69a52cd6ff9c819184d7d86cbb09d2aa-idea-to-prototype) to efficiently write one.
```text
Thank you. Now, please examine the following product specification brief closely, reason through a step-by-step implementation plan, and then implement the requisite changes to the existing codebase using clear and concise logic. For backend Python changes, follow the repository style guidance in CLAUDE.md and .cursor/rules/10-backend.mdc (readability-first, small diffs, explicit imports, simple honest typing, and clear purpose comments for non-trivial functions/classes). For frontend changes, follow the repository frontend guidance in CLAUDE.md, .cursor/rules/20-frontend.mdc, and docs/15-frontend.md: use the Pages Router, keep `apps/web/pages/*` client-only and thin, put real UI in `components/*` and browser helpers in `lib/*`, use Apollo Client for GraphQL app data and `requestApiJson()` for `/api/*`, run `cd apps/web && yarn codegen` after frontend GraphQL operation changes, and if backend GraphQL schema changes first run `cd apps/web && yarn schema:refresh` while the local API is running, extend the shared tokens in `apps/web/styles/globals.css`, and prefer one obvious pattern over flexible abstractions. Once you are finished, briefly explain the changes and what you think is still missing or could be improved.

YOUR_REQUIREMENTS_HERE
```

## If you get stuck

1. Read [README.md](./README.md)
2. Read [docs/index.md](./docs/index.md)
3. Paste the exact error into AI chat and ask:
   - "Explain what this error means in plain English."
   - "Fix it with the smallest change possible, consistent with repo conventions."

## Before you share work

Run:

```bash
make test
make lint
make typecheck
make security
```

## Read next

- [README.md](./README.md)
- [Documentation Index](./docs/index.md)
- [Local Development](./docs/10-local-dev.md)
- [Review Checklist](./REVIEW_CHECKLIST.md)

## When you are ready to release

- L1: personal or prototype usage
- L2: internal team usage
- L3: public-facing and higher risk; requires an engineer review before launch
- Deployment guide: [docs/50-deploy-cloud-run.md](./docs/50-deploy-cloud-run.md)
