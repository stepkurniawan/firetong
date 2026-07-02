#!/usr/bin/env sh
uv run uvicorn backend.firetong.main:app \
  --reload \
  --reload-dir backend \
  --reload-dir frontend \
  --reload-include '*.py' \
  --reload-include '*.ts' \
  --reload-include '*.svelte' \
  --reload-include '*.html' \
  --reload-include '*.css' \
  --reload-include '*.js' \
  --reload-include '*.webmanifest'
