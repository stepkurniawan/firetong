# firetong

FireTong (read: "Fire Tongue") MVP: capture shared browser audio, translate Indonesian sermon speech to English live, and display the source and translation in one browser page.

## What is built

- Static HTML/CSS/JS browser UI served by a tiny FastAPI local server.
- Browser audio capture with `getDisplayMedia()`.
- Live Indonesian source capture through OpenAI Realtime WebRTC transcription.
- Low-latency draft English through OpenAI Realtime translation while the speaker is still talking.
- Final backend translation to English with OpenAI `gpt-5.4-nano` and a Christian sermon prompt.
- Split Indonesian/English panels with auto-scroll, copy, export, and PWA manifest/service worker.
- Python settings via `pydantic-settings` `BaseSettings`, plus Pytest coverage for config and static app wiring.

## Run locally

```bash
uv sync
export FIRETONG_OPENAI_API_KEY="sk-..."
./start.sh
```

Open http://127.0.0.1:8000.

In Chrome or Edge, click **Test OpenAI**, then click **Start live translation**, choose the sermon tab, and enable audio sharing.

Live translation uses two OpenAI Realtime WebRTC sessions: one for Indonesian transcription and one for draft English translation. The backend mints short-lived realtime tokens, the browser streams captured tab audio directly to OpenAI, and finalized source lines are sent to the backend for authoritative English translation.

The Python server serves the static app, mints realtime transcription tokens, and proxies translation calls to OpenAI.

FireTong checks for the browser APIs it needs on load: shared audio capture, `RTCPeerConnection`, and `AudioContext`.

## Settings

Environment variables use the `FIRETONG_` prefix:

- `FIRETONG_OPENAI_BASE_URL` default: `https://api.openai.com/v1`
- `FIRETONG_OPENAI_API_KEY` required for transcription and translation
- `FIRETONG_TRANSLATION_MODEL` default: `gpt-5.4-nano`
- `FIRETONG_TRANSCRIPTION_MODEL` default: `gpt-realtime-whisper`
- `FIRETONG_REALTIME_TRANSLATION_MODEL` default: `gpt-realtime-translate`
- `FIRETONG_REALTIME_TRANSLATION_LANGUAGE` default: `en`
- `FIRETONG_REALTIME_TRANSCRIPTION_DELAY` default: `low`
- `FIRETONG_LIVE_TRANSLATION_DEBOUNCE_MS` default: `500`
- `FIRETONG_LIVE_TRANSLATION_FORCE_WORDS` default: `20`

## Test

```bash
uv run pytest
```

## Manual browser verification

Use Chrome or Edge at http://127.0.0.1:8000.

Expected pass criteria:

- Status shows `Ready` after load.
- **Test OpenAI** reports `Backend translation test passed.`
- **Start live translation** allows tab/window sharing with audio enabled.
- Speaking Indonesian audio causes the Indonesian panel to update live.
- The English panel shows a lighter live draft while speech continues, then appends final translations after finalized transcript lines.
- `Phrases` increments after each finalized transcript line.
- `Last latency` updates after each finalized line.
- **Export** downloads `firetong-transcript.txt`.
