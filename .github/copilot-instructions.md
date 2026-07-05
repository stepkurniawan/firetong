# Copilot Instructions for FireTong

FireTong captures browser audio, transcribes sermon speech, translates it live,
and displays source and translated text in one Svelte app served by FastAPI.

## Project Shape

- Frontend: Svelte 5 + TypeScript in `frontend/src`.
- Backend: FastAPI + Pydantic in `backend/firetong`.
- Static production frontend is built into `backend/static`.
- Runtime settings use `FIRETONG_` environment variables.
- Supported runtime language codes are `id`, `en`, and `de`.

## Coding Rules

- Keep changes surgical and avoid speculative abstractions.
- Follow existing naming, component structure, and formatting.
- Do not commit secrets or hard-code API keys.
- Do not make the backend proxy translation text; the browser streams audio directly to OpenAI Realtime sessions.
- Keep UI copy plain for primary actions such as connection checks, starting capture, support, and feedback.
- Update tests when behavior changes.

## Useful Commands

```bash
npm run check
npm run build
npm run test
uv run ruff check
uv run ruff format --check
uv run pytest
```

Use `npm run dev:api` for the local FastAPI API and `npm run dev` for the Vite
frontend during development.
