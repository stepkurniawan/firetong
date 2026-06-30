# firetong

FireTong (read: "Fire Tongue") MVP: capture shared browser audio, transcribe Indonesian sermon chunks, translate them to English, and display both sides in one browser page.

## What is built

- Static HTML/CSS/JS browser UI served by a tiny FastAPI local server.
- Browser audio capture with `getDisplayMedia()`.
- Indonesian speech-to-text through the OpenAI Whisper API via the local backend.
- Backend translation call to OpenAI `gpt-4o-mini` with a Christian sermon prompt.
- Half-second silence-gap phrase flushing with a max chunk length fallback.
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

The transcription is done by OpenAI Whisper API through the local backend, not by a browser model. FireTong sends each audio phrase to `/api/transcribe`, then sends only text to OpenAI for translation.

The Python server serves the static app and proxies transcription/translation calls to OpenAI.

FireTong checks for the browser APIs it needs on load: shared audio capture, `MediaRecorder`, `AudioContext`, and `OfflineAudioContext`.

## Settings

Environment variables use the `FIRETONG_` prefix:

- `FIRETONG_OPENAI_BASE_URL` default: `https://api.openai.com/v1`
- `FIRETONG_OPENAI_API_KEY` required for transcription and translation
- `FIRETONG_TRANSLATION_MODEL` default: `gpt-4o-mini`
- `FIRETONG_TRANSCRIPTION_MODEL` default: `whisper-1`
- `FIRETONG_CHUNK_SECONDS` default: `5`

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
- Speaking Indonesian audio causes the Indonesian panel to append text.
- The English panel appends a matching translation.
- `Phrases` increments after each pause.
- `Last latency` updates after each translated phrase.
- **Export** downloads `firetong-transcript.txt`.
