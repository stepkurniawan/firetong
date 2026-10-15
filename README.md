# firetong

FireTong (read: "Fire Tongue") MVP: capture shared browser audio, translate sermon speech live between Indonesian, English, and German, and display the source and translation in one browser page.

## License

This project is dual-licensed.

Free license: allowed only for church or Christian-related activities that are free to participants.

Paid license: required for any paid, commercial, or monetized use.

See [LICENSE-free-christian.md](LICENSE-free-christian.md) and [LICENSE-commercial.md](LICENSE-commercial.md).

## What is built

- Svelte + TypeScript browser UI served by a tiny FastAPI local server.
- Browser audio capture from shared desktop/tab audio or a selected microphone.
- Live source capture through OpenAI Realtime WebRTC transcription.
- Live translation through OpenAI Realtime Translation WebRTC.
- Split source/translation panels with auto-scroll and PWA manifest/service worker.
- Automatic per-session transcript saves with separate input and output text files.
- Python settings via `pydantic-settings` `BaseSettings`, plus Pytest coverage for config and static app wiring.

## Run locally

For everyday frontend development, run the FastAPI API and Vite dev server in
separate terminals:

```bash
uv sync
npm install
export FIRETONG_OPENAI_API_KEY="sk-..."
npm run dev:api
```

```bash
npm run dev
```

Open http://127.0.0.1:5173. Vite serves the Svelte app with hot reload and
proxies `/api` requests to FastAPI on http://127.0.0.1:8000, so frontend edits do
not require `npm run build`.

To verify the production static app locally, run `./start.sh` and open
http://127.0.0.1:8000. The script rebuilds the frontend before starting FastAPI.

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

When a live session is stopped, FireTong writes timestamped text files under
`saved-sessions/input` and `saved-sessions/output` by default, for example
`input/2026-07-04-07-30-id.txt` and
`output/2026-07-04-07-30-en.txt`, plus a matching
`2026-07-04-07-30-metadata.json` file with the language codes, session
times, estimated USD cost, and saved file paths. With Docker Compose, the
container path is mounted to `FIRETONG_TRANSCRIPT_HOST_DIR`, which defaults to
`./saved-sessions`.

## Run on a NAS

Use the NAS Compose file when you want the NAS to run the published Docker Hub
image and let an existing NAS Watchtower update it automatically:

```bash
cp .env.example .env
# edit .env and set FIRETONG_OPENAI_API_KEY
docker compose -f compose.nas.yaml up -d
```

Do not use `--build` for the NAS image path. The NAS Compose file pulls the
published Docker Hub image instead of building locally.

The default NAS image is `stepkurniawan/firetong:latest`, which is published by
the GitHub Actions workflow for `linux/amd64` and `linux/arm64`.

The NAS Compose file labels `firetong` for Watchtower. If your existing Watchtower
runs with `--label-enable`, this label is what allows it to update the container.
Updates happen on that existing Watchtower schedule, for example the next daily
poll if it checks once per day.

The readable frontend source lives in `frontend/src`. The backend lives in
`backend/firetong`. In development, Vite serves the frontend and proxies API
requests to FastAPI. The production frontend build is written to
`backend/static`, which is the directory mounted by FastAPI in the Docker image
and production-style local runs.

In Chrome or Edge, click **Check connection**, choose **Desktop or tab audio** or
**Microphone input**, choose the input and output languages, then click **Start
live translation**. For desktop/tab audio, choose the sermon tab or screen in
the browser picker and enable audio sharing. For microphone input, choose the
preferred microphone before starting.

Live translation uses two OpenAI Realtime WebRTC sessions: one reliable transcription sidecar for source text and one translation session for the translated transcript. The backend mints short-lived realtime tokens, and the browser streams captured tab audio directly to OpenAI.

The Python server serves the static app and mints realtime transcription/translation tokens. It does not proxy text translation calls.

Server transcript saving is off by default. When a visitor checks **Save transcripts
on FireTong server**, stopping capture sends the translated text and, when input
transcription is enabled, the source text to the Python server. Visitors can also
download the available transcript and translation as a text file without enabling
server saving. Set `FIRETONG_TRANSCRIPT_SAVE_DIR` to choose a different server save
folder.

Bug reports are sent by the Python server through SMTP. Set
`FIRETONG_FEEDBACK_SMTP_HOST` and `FIRETONG_FEEDBACK_EMAIL_FROM`, plus
`FIRETONG_FEEDBACK_SMTP_USERNAME` and `FIRETONG_FEEDBACK_SMTP_PASSWORD` when your
mail provider requires authentication. Reports are sent to
`FIRETONG_FEEDBACK_EMAIL_TO`, which defaults to `stepkurniawan.learn@gmail.com`,
with subject `firetong bug`.

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
- `FIRETONG_REALTIME_INPUT_LANGUAGE` default: `id`
- `FIRETONG_REALTIME_TRANSLATION_MODEL` default: `gpt-realtime-translate`
- `FIRETONG_REALTIME_TRANSLATION_LANGUAGE` default: `en`
- `FIRETONG_REALTIME_TRANSCRIPTION_DELAY` default: `low`
- `FIRETONG_TRANSCRIPT_SAVE_DIR` default: `saved-sessions`
- `FIRETONG_FEEDBACK_EMAIL_TO` default: `stepkurniawan.learn@gmail.com`
- `FIRETONG_FEEDBACK_EMAIL_FROM` required for bug report email
- `FIRETONG_FEEDBACK_SMTP_HOST` required for bug report email
- `FIRETONG_FEEDBACK_SMTP_PORT` default: `587`
- `FIRETONG_FEEDBACK_SMTP_USERNAME` optional SMTP login username
- `FIRETONG_FEEDBACK_SMTP_PASSWORD` optional SMTP login password
- `FIRETONG_FEEDBACK_SMTP_STARTTLS` default: `true`
- `FIRETONG_FEEDBACK_SMTP_SSL` default: `false`

Supported runtime language codes are `id`, `en`, and `de`.

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
- **Check connection** reports `Realtime translation test passed.`
- **Start live translation** allows tab/window sharing with audio enabled when
  **Desktop or tab audio** is selected.
- **Microphone input** captures the selected microphone.
- Speaking the selected input language causes the source panel to update live.
- The selected output language panel updates live.
- Stopping a non-empty session creates timestamp-language `.txt` files under
  `input` and `output` folders, plus a matching metadata JSON file under the
  configured transcript save directory.
