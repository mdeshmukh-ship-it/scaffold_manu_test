# LLM Primitive

## Default Pattern

Use `api/llm/client.py` for all LLM text generation.

Why:

- provider-agnostic interface
- secret-free local default for prototypes
- safe retries/timeouts
- consistent outbound logging
- deterministic mock provider retained for tests

## Default Local Mode

- `LLM_PROVIDER=local_qwen`
- `LLM_MODEL=Qwen/Qwen3.5-2B`
- one-time setup: `make llm_local_setup`
- no API key required
- downloads about 4.5 GB into the normal Hugging Face cache
- `make dev` and Replit `Run` auto-start the local runtime when `LLM_PROVIDER=local_qwen`
- the first summary request may take a while while the model loads into memory

## Performance Notes

- The scaffold ships with `Qwen/Qwen3.5-2B` as the default local model.
- This family is unusually strong for small open-weight models and is far more useful than a trivial mock.
- Treat the default local model as a capable prototype model with quality that can feel between GPT-4 and GPT-4o on many scaffold-scale tasks.
- Latency depends heavily on your hardware; local CPUs will usually be slower than hosted APIs.

## Supported Providers

- `local_qwen`
- `mock`
- `openai`
- `anthropic`

## Required Env Vars

- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_LOCAL_BASE_URL` when using `local_qwen`
- `OPENAI_API_KEY` when using `openai`
- `ANTHROPIC_API_KEY` when using `anthropic`

## Security Rules

- Never paste keys into chat.
- Store keys in the correct secret channel for your tool.
- Prefer `local_qwen` when you want a secret-free prototype path.
- Route all provider calls through `outbound_http.request(...)` via the LLM client.

## Sample Usage

- The default notes app uses this primitive for note summarization.
- Local development and Replit use `local_qwen` by default after `make llm_local_setup`.
- Tests keep `LLM_PROVIDER=mock` for speed and determinism.