# firetongue

FireTongue MVP: capture shared browser audio, transcribe Indonesian sermon chunks, translate them to English, and display both sides in one browser page.

## What is built

- Static HTML/CSS/JS browser UI served by a tiny FastAPI local server.
- Browser audio capture with `getDisplayMedia()`.
- In-browser Indonesian speech-to-text with `@xenova/transformers` and `Xenova/whisper-tiny`.
- Direct browser translation call to OpenAI `gpt-4o-mini` with a Christian sermon prompt.
- Silence-gap phrase flushing with a max chunk length fallback.
- Split Indonesian/English panels with auto-scroll, copy, export, API-key entry, and PWA manifest/service worker.
- Python settings via `pydantic-settings` `BaseSettings`, plus Pytest coverage for config and static app wiring.

## Run locally

```bash
uv sync
uv run uvicorn firetongue.main:app --reload
```

Open http://127.0.0.1:8000.

In Chrome or Edge, paste your OpenAI API key in the page, click **Test OpenAI**, click **Load Whisper** to warm up the in-browser model, then click **Capture tab audio**, choose the sermon tab, and enable audio sharing. You can also type Indonesian text manually and click **Translate**.

The first transcription can take a while because the browser downloads the Whisper model. After that, FireTongue listens for short pauses and processes each phrase locally before sending only text to OpenAI for translation.

The Python server is only a local static host plus config endpoint. The browser app has built-in defaults, so it can also be hosted as ordinary static files.

FireTongue checks for the browser APIs it needs on load: shared audio capture, `MediaRecorder`, `AudioContext`, and `OfflineAudioContext`.

## Settings

Environment variables use the `FIRETONGUE_` prefix:

- `FIRETONGUE_OPENAI_BASE_URL` default: `https://api.openai.com/v1`
- `FIRETONGUE_TRANSLATION_MODEL` default: `gpt-4o-mini`
- `FIRETONGUE_TRANSCRIPTION_MODEL` default: `Xenova/whisper-tiny`
- `FIRETONGUE_CHUNK_SECONDS` default: `5`

## Test

```bash
uv run pytest
```

## Manual browser verification

Use Chrome or Edge at http://127.0.0.1:8000.

Expected pass criteria:

- Status shows `Ready` after load.
- **Test OpenAI** reports `OpenAI translation test passed.`
- **Load Whisper** reports `Xenova/whisper-tiny is ready.`
- **Capture tab audio** allows tab/window sharing with audio enabled.
- Speaking Indonesian audio causes the Indonesian panel to append text.
- The English panel appends a matching translation.
- `Phrases` increments after each pause.
- `Last latency` updates after each translated phrase.
- **Export** downloads `firetongue-transcript.txt`.
