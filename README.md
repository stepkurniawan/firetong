# firetong

FireTong (read: "Fire Tongue") MVP: capture shared browser audio, translate Indonesian sermon speech to English live, and display the source and translation in one browser page.

## What is built

- Svelte + TypeScript browser UI served by a tiny FastAPI local server.
- Browser audio capture with `getDisplayMedia()`.
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

The readable frontend source lives in `frontend/src`. The backend lives in
`backend/firetong`. The production frontend build is written to `backend/static`,
which is the directory mounted by FastAPI.

In Chrome or Edge, click **Test OpenAI**, then click **Start live translation**, choose the sermon tab, and enable audio sharing.

Live translation uses two OpenAI Realtime WebRTC sessions: one reliable transcription sidecar for Indonesian source text and one translation session for English transcript. The backend mints short-lived realtime tokens, and the browser streams captured tab audio directly to OpenAI.

The Python server serves the static app and mints realtime transcription/translation tokens. It does not proxy text translation calls.

FireTong checks for the browser APIs it needs on load: shared audio capture, `RTCPeerConnection`, and `AudioContext`.

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
uv run pytest
```

## Manual browser verification

Use Chrome or Edge at http://127.0.0.1:8000.

Expected pass criteria:

- Status shows `Ready` after load.
- **Test OpenAI** reports `Realtime translation test passed.`
- **Start live translation** allows tab/window sharing with audio enabled.
- Speaking Indonesian audio causes the Indonesian panel to update live.
- The English panel updates live.
