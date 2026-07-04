from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from httpx import AsyncClient, HTTPError

from backend.firetong.schemas import (
    AppConfig,
    RealtimeTokenResponse,
    TranscriptSessionSaveRequest,
    TranscriptSessionSaveResponse,
)
from backend.firetong.settings import SUPPORTED_REALTIME_LANGUAGES, Settings, get_settings

app = FastAPI(title="FireTong MVP")


def resolve_realtime_language(
    requested_language: str | None,
    default_language: str,
    field_name: str,
) -> str:
    language = (requested_language or default_language).strip().lower()
    if language in SUPPORTED_REALTIME_LANGUAGES:
        return language

    allowed_languages = ", ".join(SUPPORTED_REALTIME_LANGUAGES)
    raise HTTPException(422, detail=f"{field_name} must be one of: {allowed_languages}.")


@app.get("/api/config", response_model=AppConfig)
def read_config(settings: Settings = Depends(get_settings)) -> AppConfig:
    return AppConfig(
        openai_base_url=str(settings.openai_base_url).rstrip("/"),
        realtime_input_language=settings.realtime_input_language,
        realtime_translation_model=settings.realtime_translation_model,
        realtime_translation_language=settings.realtime_translation_language,
    )


async def post_to_openai(
    settings: Settings,
    path: str,
    api_key_override: str | None = None,
    json_data=None,
    form_data=None,
    files=None,
):
    api_key = (api_key_override or settings.openai_api_key or "").strip()
    if not api_key:
        raise HTTPException(503, detail="OpenAI API key is not configured on the server.")

    url = str(settings.openai_base_url).rstrip("/") + path
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with AsyncClient(timeout=60) as client:
            response = await client.post(
                url,
                headers=headers,
                json=json_data,
                data=form_data,
                files=files,
            )
            response.raise_for_status()
            return response.json()
    except HTTPError as exc:
        raise HTTPException(502, detail=f"OpenAI request failed: {exc}") from exc


@app.get("/api/realtime/translation-token", response_model=RealtimeTokenResponse)
async def create_realtime_translation_token(
    output_language: Annotated[str | None, Query()] = None,
    settings: Settings = Depends(get_settings),
    openai_api_key: Annotated[str | None, Header(alias="X-OpenAI-API-Key")] = None,
) -> RealtimeTokenResponse:
    selected_output_language = resolve_realtime_language(
        output_language,
        settings.realtime_translation_language,
        "output_language",
    )

    response = await post_to_openai(
        settings,
        "/realtime/translations/client_secrets",
        api_key_override=openai_api_key,
        json_data={
            "session": {
                "model": settings.realtime_translation_model,
                "audio": {
                    "output": {
                        "language": selected_output_language,
                    },
                },
            }
        },
    )

    client_secret = response.get("value")
    if not client_secret:
        raise HTTPException(
            502, detail="OpenAI did not return a realtime translation client secret."
        )

    return RealtimeTokenResponse(value=client_secret)


@app.get("/api/realtime/token", response_model=RealtimeTokenResponse)
async def create_realtime_token(
    input_language: Annotated[str | None, Query()] = None,
    settings: Settings = Depends(get_settings),
    openai_api_key: Annotated[str | None, Header(alias="X-OpenAI-API-Key")] = None,
) -> RealtimeTokenResponse:
    selected_input_language = resolve_realtime_language(
        input_language,
        settings.realtime_input_language,
        "input_language",
    )

    response = await post_to_openai(
        settings,
        "/realtime/client_secrets",
        api_key_override=openai_api_key,
        json_data={
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "transcription": {
                            "model": settings.transcription_model,
                            "language": selected_input_language,
                            "delay": settings.realtime_transcription_delay,
                        },
                        "turn_detection": None,
                    }
                },
            }
        },
    )

    client_secret = response.get("value")
    if not client_secret:
        raise HTTPException(502, detail="OpenAI did not return a realtime client secret.")

    return RealtimeTokenResponse(value=client_secret)


@app.post("/api/transcript-sessions", response_model=TranscriptSessionSaveResponse)
def save_transcript_session(
    payload: TranscriptSessionSaveRequest,
    settings: Settings = Depends(get_settings),
) -> TranscriptSessionSaveResponse:
    source_text = payload.source_text.strip()
    translated_text = payload.translated_text.strip()
    if not source_text and not translated_text:
        raise HTTPException(422, detail="At least one transcript field is required.")

    input_language = resolve_realtime_language(
        payload.input_language,
        settings.realtime_input_language,
        "input_language",
    )
    output_language = resolve_realtime_language(
        payload.output_language,
        settings.realtime_translation_language,
        "output_language",
    )

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    session_dir = (
        settings.transcript_save_dir / f"{timestamp}-{input_language}-to-{output_language}"
    )
    input_path = session_dir / "input.txt"
    output_path = session_dir / "output.txt"
    metadata_path = session_dir / "metadata.json"

    try:
        session_dir.mkdir(parents=True, exist_ok=False)
        input_path.write_text(source_text + "\n", encoding="utf-8")
        output_path.write_text(translated_text + "\n", encoding="utf-8")
        metadata_path.write_text(
            payload.model_dump_json(indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as exc:
        raise HTTPException(500, detail=f"Could not save transcript session: {exc}") from exc

    return TranscriptSessionSaveResponse(
        directory=str(session_dir),
        input_path=str(input_path),
        output_path=str(output_path),
    )


static_dir = Path(__file__).parents[1] / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
