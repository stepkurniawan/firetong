# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY svelte.config.js tsconfig.json tsconfig.node.json tsconfig.service-worker.json vite.config.ts ./
COPY frontend ./frontend

RUN npm run build


FROM ghcr.io/astral-sh/uv:python3.14-alpine AS runtime

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend ./backend
COPY --from=frontend-build /app/backend/static ./backend/static

EXPOSE 8000

CMD ["uvicorn", "backend.firetong.main:app", "--host", "0.0.0.0", "--port", "8000"]
