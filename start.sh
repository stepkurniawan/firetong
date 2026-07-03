#!/usr/bin/env sh
uv run uvicorn backend.firetong.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  --reload \
  --reload-dir backend
