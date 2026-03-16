SHELL := /bin/bash

.PHONY: setup verify_setup dev dev_stop llm_local_setup llm_local_start llm_local_stop test lint typecheck security fmt build deploy

setup:
	./scripts/setup.sh

verify_setup:
	./scripts/verify_setup.sh

dev:
	./scripts/dev.sh

dev_stop:
	./scripts/dev_stop.sh

llm_local_setup:
	./scripts/llm_local_setup.sh

llm_local_start:
	./scripts/llm_local_start.sh

llm_local_stop:
	./scripts/llm_local_stop.sh

test:
	cd apps/api && uv run pytest
	cd apps/web && yarn test

lint:
	cd apps/api && uv run ruff check src tests
	cd apps/api && uv run ruff format --check src tests
	cd apps/web && yarn lint
	cd apps/web && yarn format:check

typecheck:
	cd apps/api && uv run mypy src
	cd apps/web && yarn codegen:check
	cd apps/web && yarn typecheck

security:
	python3 ./scripts/check_secrets.py
	cd apps/api && uv run pip-audit
	cd apps/api && uv run ruff check src --select S
	cd apps/web && yarn audit --level high --groups dependencies

fmt:
	cd apps/api && uv run ruff format src tests
	cd apps/web && yarn format

build:
	docker build -t scaffold-app .

deploy:
	./scripts/gcp_print_env.sh
	@echo "Deploy command template:"
	@echo "gcloud run deploy scaffold-app --source . --region us-central1 --allow-unauthenticated"
