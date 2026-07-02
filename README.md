# firetong

FireTong (read: "Fire Tongue") MVP: capture shared browser audio, translate Indonesian sermon speech to English live, and display the source and translation in one browser page.

## What is built

- Svelte + TypeScript browser UI served by a tiny FastAPI local server.
- Browser audio capture from shared desktop/tab audio or a selected microphone.
- Live Indonesian source capture through OpenAI Realtime WebRTC transcription.
- Live English translation through OpenAI Realtime Translation WebRTC.
- Split Indonesian/English panels with auto-scroll and PWA manifest/service worker.
- Python settings via `pydantic-settings` `BaseSettings`, plus Pytest coverage for config and static app wiring.

## Run locally

```bash
uv sync
npm install
npm run build
export FIRETONG_OPENAI_API_KEY="sk-..."
./start.sh
```

Open http://127.0.0.1:8000.

## Run with Docker Compose

```bash
cp .env.example .env
# edit .env and set FIRETONG_OPENAI_API_KEY
docker compose up --build
```

Open http://127.0.0.1:8000.

If port 8000 is already in use, choose another host port:

```bash
FIRETONG_PORT=8001 docker compose up --build
```

The Docker image builds the Svelte frontend, copies the generated static files into
the FastAPI app, and runs Uvicorn on port 8000. Runtime settings are passed through
Compose from your shell or `.env`; secrets are not copied into the image.

The readable frontend source lives in `frontend/src`. The backend lives in
`backend/firetong`. The production frontend build is written to `backend/static`,
which is the directory mounted by FastAPI.

In Chrome or Edge, click **Test OpenAI**, choose **Desktop or tab audio** or
**Microphone input**, then click **Start live translation**. For desktop/tab
audio, choose the sermon tab or screen in the browser picker and enable audio
sharing. For microphone input, choose the preferred microphone before starting.

Live translation uses two OpenAI Realtime WebRTC sessions: one reliable transcription sidecar for Indonesian source text and one translation session for English transcript. The backend mints short-lived realtime tokens, and the browser streams captured tab audio directly to OpenAI.

The Python server serves the static app and mints realtime transcription/translation tokens. It does not proxy text translation calls.

FireTong checks for the browser APIs it needs on load: at least one browser audio
capture path, `RTCPeerConnection`, and `AudioContext`.

## Docker Hub publishing

The GitHub Actions workflow in `.github/workflows/docker-image.yml` builds the
Dockerfile on pull requests and publishes the image to Docker Hub on pushes to
`main`, version tags like `v0.1.0`, and manual workflow runs.

Configure these repository secrets in GitHub:

- `DOCKERHUB_USERNAME`: Docker Hub namespace for the image.
- `DOCKERHUB_TOKEN`: Docker Hub access token or password with push access.

Images are pushed as `DOCKERHUB_USERNAME/firetong` with branch, tag, SHA, and
`latest` tags where applicable.

## Settings

Environment variables use the `FIRETONG_` prefix:

- `FIRETONG_OPENAI_BASE_URL` default: `https://api.openai.com/v1`
- `FIRETONG_OPENAI_API_KEY` required for transcription and translation
- `FIRETONG_TRANSCRIPTION_MODEL` default: `gpt-realtime-whisper`
- `FIRETONG_REALTIME_TRANSLATION_MODEL` default: `gpt-realtime-translate`
- `FIRETONG_REALTIME_TRANSLATION_LANGUAGE` default: `en`
- `FIRETONG_REALTIME_TRANSCRIPTION_DELAY` default: `low`

## Test

```bash
npm run check
npm run build
uv run ruff check
uv run ruff format --check
uv run pytest
```

## Pre-commit

```bash
uv sync
npm install
uv run pre-commit install
uv run pre-commit run --all-files
```

The hook runs Ruff linting/formatting for Python and `npm run check` for the
Svelte frontend.

## Manual browser verification

Use Chrome or Edge at http://127.0.0.1:8000.

Expected pass criteria:

- Status shows `Ready` after load.
- **Test OpenAI** reports `Realtime translation test passed.`
- **Start live translation** allows tab/window sharing with audio enabled when
  **Desktop or tab audio** is selected.
- **Microphone input** captures the selected microphone.
- Speaking Indonesian audio causes the Indonesian panel to update live.
- The English panel updates live.
