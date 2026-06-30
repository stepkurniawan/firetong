# FireTong

FireTong is a lightweight MVP for capturing browser audio, transcribing Indonesian sermon audio, and translating it to English in a single browser page.

## Key Features

- Local FastAPI server serving a static browser application
- Browser tab audio capture using `getDisplayMedia()`
- OpenAI Realtime WebRTC transcription with server-minted client secrets
- OpenAI translation of Indonesian sermon text to English through the local backend
- Split Indonesian / English transcript panels with auto-scroll and export
- Simple local API for runtime configuration, realtime token creation, and translation
- Pytest coverage for config and app wiring

## Requirements

- Python 3.11+
- `uv` package manager (project uses `uv` to manage the environment)
- Chrome or Edge for browser audio capture

## Installation

From the repository root:

```bash
uv sync
```

## Run locally

Start the app with:

```bash
export FIRETONG_OPENAI_API_KEY="sk-..."
./start.sh
```

Then open:

```text
http://127.0.0.1:8000
```

## Usage

- Load the page in Chrome or Edge
- Click **Test OpenAI** to verify backend OpenAI access
- Click **Capture tab audio** and select the sermon tab with audio enabled
- The app streams captured tab audio through an OpenAI Realtime WebRTC transcription session

## Configuration

FireTong reads runtime settings from environment variables prefixed with `FIRETONG_`.

- `FIRETONG_OPENAI_BASE_URL` — Base URL for OpenAI API (default: `https://api.openai.com/v1`)
- `FIRETONG_OPENAI_API_KEY` — OpenAI API key used by the local backend
- `FIRETONG_TRANSLATION_MODEL` — Translation model (default: `gpt-4o-mini`)
- `FIRETONG_TRANSCRIPTION_MODEL` — OpenAI Realtime transcription model (default: `gpt-realtime-whisper`)
- `FIRETONG_REALTIME_TRANSCRIPTION_DELAY` — Realtime transcription latency setting (default: `low`)

## API Endpoints

- `GET /api/config` — returns current app configuration
- `GET /api/realtime/token` — creates a short-lived OpenAI Realtime client secret
- `POST /api/translate` — translate Indonesian text to English

## Testing

Run the test suite with:

```bash
uv run pytest
```

## Notes

- The Python backend owns OpenAI token creation and translation calls.
- For full browser audio capture, use Chrome or Edge and enable tab audio sharing.
