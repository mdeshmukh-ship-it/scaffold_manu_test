FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1 \
    PORT=8080 \
    APP_ENV=prod \
    APP_HOST=127.0.0.1 \
    APP_PORT=8001

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    supervisor \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends \
    nodejs \
    && corepack enable \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY apps/api/pyproject.toml apps/api/uv.lock ./apps/api/
RUN cd apps/api && uv sync --frozen --no-dev

COPY apps/web/package.json apps/web/yarn.lock ./apps/web/
RUN cd apps/web && yarn install --frozen-lockfile

COPY . .

RUN cd apps/web && yarn build

EXPOSE 8080

CMD ["/usr/bin/supervisord", "-c", "/app/supervisord.conf"]
