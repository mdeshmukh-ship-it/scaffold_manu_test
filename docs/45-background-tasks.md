# Background Tasks

## Default Pattern

Use the tracked-task helper in `api/tasks/base.py` for lightweight background work.

This scaffold intentionally does **not** ship a full queue system. The built-in pattern is for:

- fire-and-forget work inside the API process
- short-to-medium async jobs
- prototype scheduler integrations
- best-effort jobs that can be safely retried

## What The Helper Provides

- `spawn_tracked_task(...)`
- persisted task status/progress rows in `task_runs`
- progress updates and failure tracking
- easy GraphQL or REST polling
- startup cleanup that marks abandoned queued/running rows as failed after a restart

## When To Use It

- batch LLM processing
- scheduled maintenance jobs
- longer-running API tasks that should not block the request

Do not treat this helper as a durable queue. If you need guaranteed delivery or cross-process workers, replace it with a real job system before shipping beyond early-stage use.

## Scheduler Pattern

- Sample endpoint: `POST /api/tasks/note-summary/run`
- Protect production calls with `SCHEDULER_SHARED_TOKEN`
- In local/test, the endpoint is allowed without the token for easy iteration

## Cloud Scheduler

For production, point Cloud Scheduler at the task endpoint and send:

- `X-Scheduler-Token: <token>`

Store that token in Secret Manager and map it to `SCHEDULER_SHARED_TOKEN` at runtime.

## Sample Usage

- The default notes app includes:
  - a synchronous `summarizeNote` action
  - a background `startNoteSummaryRun` action
  - task status polling in the frontend
