# firetong

FireTong (read: "Fire Tongue") MVP: capture shared browser audio, stream Indonesian sermon transcription, translate finalized lines to English, and display both sides in one browser page.

## What is built

- Static HTML/CSS/JS browser UI served by a tiny FastAPI local server.
- Browser audio capture with `getDisplayMedia()`.
- Live Indonesian speech-to-text through OpenAI Realtime WebRTC transcription.
- Backend translation call to OpenAI `gpt-4o-mini` with a Christian sermon prompt.
- Split Indonesian/English panels with auto-scroll, copy, export, and PWA manifest/service worker.
- Python settings via `pydantic-settings` `BaseSettings`, plus Pytest coverage for config and static app wiring.

## Run locally

```bash
uv sync
export FIRETONG_OPENAI_API_KEY="sk-..."
./start.sh
```

Open http://127.0.0.1:8000.

In Chrome or Edge, click **Test OpenAI**, then click **Capture tab audio**, choose the sermon tab, and enable audio sharing. You can also type Indonesian text manually and click **Translate**.

The transcription uses an OpenAI Realtime WebRTC session. The backend mints a short-lived realtime token, the browser streams captured tab audio directly to OpenAI, and finalized transcript lines are sent to the backend for English translation.

The Python server serves the static app, mints realtime transcription tokens, and proxies translation calls to OpenAI.

FireTong checks for the browser APIs it needs on load: shared audio capture, `RTCPeerConnection`, and `AudioContext`.

## Settings

Environment variables use the `FIRETONG_` prefix:

- `FIRETONG_OPENAI_BASE_URL` default: `https://api.openai.com/v1`
- `FIRETONG_OPENAI_API_KEY` required for transcription and translation
- `FIRETONG_TRANSLATION_MODEL` default: `gpt-4o-mini`
- `FIRETONG_TRANSCRIPTION_MODEL` default: `gpt-realtime-whisper`
- `FIRETONG_REALTIME_TRANSCRIPTION_DELAY` default: `low`

## Test

```bash
uv run pytest
```

## Manual browser verification

Use Chrome or Edge at http://127.0.0.1:8000.

Expected pass criteria:

- Status shows `Ready` after load.
- **Test OpenAI** reports `Backend translation test passed.`
- **Capture tab audio** allows tab/window sharing with audio enabled.
- Speaking Indonesian audio causes the Indonesian panel to update live.
- The English panel appends a matching translation after finalized transcript lines.
- `Phrases` increments after each finalized transcript line.
- `Last latency` updates after each finalized line.
- **Export** downloads `firetong-transcript.txt`.
