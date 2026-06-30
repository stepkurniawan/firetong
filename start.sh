#!/usr/bin/env sh
uv run uvicorn firetong.main:app \
  --reload \
  --reload-dir firetong \
  --reload-include '*.py' \
  --reload-include '*.html' \
  --reload-include '*.css' \
  --reload-include '*.js' \
  --reload-include '*.jinja2' \
  --reload-include '*.webmanifest'
