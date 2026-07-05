# FireTong Project Guidelines

FireTong is a small Svelte + TypeScript frontend served by a FastAPI backend.
Keep changes direct, readable, and easy to verify.

## Working Style

- Make the smallest change that solves the current problem.
- Prefer clear product copy over metaphorical labels in primary navigation and controls.
- Match the existing file style before introducing new patterns.
- Do not refactor unrelated code while fixing a focused issue.
- Keep secrets out of source control. Use `FIRETONG_` environment variables and `.env.example`.

## Frontend

- Frontend source lives in `frontend/src`.
- Use Svelte 5 and TypeScript patterns already present in the app.
- Keep browser-only logic in the frontend; the backend should not proxy translation text.
- Keep UI states explicit for connection, capture, transcript, and save behavior.
- When changing UI behavior, check both desktop/tab audio and microphone flows when relevant.

## Backend

- Backend source lives in `backend/firetong`.
- Use FastAPI, Pydantic, and `pydantic-settings` for configuration.
- Keep API responses covered by schemas when practical.
- Preserve the local static-app serving path used by Docker and production-style runs.
- Transcript saving should remain local and configurable through `FIRETONG_TRANSCRIPT_SAVE_DIR`.

## Verification

Run the narrowest useful checks first, then broaden when the change touches shared behavior:

```bash
npm run check
npm run build
npm run test
uv run ruff check
uv run ruff format --check
uv run pytest
```

For manual browser checks, use Chrome or Edge and verify the relevant audio capture path,
live source text, live translated text, and transcript save output.
