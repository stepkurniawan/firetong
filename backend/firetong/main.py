import smtplib
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from httpx import AsyncClient, HTTPError

from backend.firetong.feedback import FeedbackEmailNotConfiguredError, send_feedback_email
from backend.firetong.runtime_config import (
    REALTIME_DURATION_RATES_USD_PER_MINUTE,
    REALTIME_LANGUAGE_OPTIONS,
    SUPPORTED_REALTIME_LANGUAGES,
)
from backend.firetong.schemas import (
    AppConfig,
    FeedbackReportRequest,
    FeedbackReportResponse,
    RealtimeTokenResponse,
    TranscriptSessionSaveRequest,
    TranscriptSessionSaveResponse,
)
from backend.firetong.settings import Settings, get_settings
from backend.firetong.transcript_sessions import (
    EmptyTranscriptSessionError,
    MissingTranslatedTranscriptError,
    save_transcript_session_files,
)

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


def ensure_distinct_realtime_languages(input_language: str, output_language: str) -> None:
    if input_language == output_language:
        raise HTTPException(
            422,
            detail="input_language and output_language must be different.",
        )


def request_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


@app.get("/api/config", response_model=AppConfig)
def read_config(settings: Settings = Depends(get_settings)) -> AppConfig:
    return AppConfig(
        openai_base_url=str(settings.openai_base_url).rstrip("/"),
        transcription_model=settings.transcription_model,
        realtime_input_language=settings.realtime_input_language,
        realtime_translation_model=settings.realtime_translation_model,
        realtime_translation_language=settings.realtime_translation_language,
        realtime_language_options=list(REALTIME_LANGUAGE_OPTIONS),
        realtime_duration_rates_usd_per_minute=REALTIME_DURATION_RATES_USD_PER_MINUTE,
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
    ensure_distinct_realtime_languages(input_language, output_language)

    try:
        return save_transcript_session_files(
            payload,
            settings.transcript_save_dir,
            input_language,
            output_language,
            settings.transcription_model,
            settings.realtime_translation_model,
        )
    except EmptyTranscriptSessionError as exc:
        raise HTTPException(422, detail="At least one transcript field is required.") from exc
    except MissingTranslatedTranscriptError as exc:
        raise HTTPException(422, detail="translated_text is required.") from exc
    except OSError as exc:
        raise HTTPException(500, detail=f"Could not save transcript session: {exc}") from exc


@app.post("/api/feedback", response_model=FeedbackReportResponse)
def send_feedback_report(
    payload: FeedbackReportRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> FeedbackReportResponse:
    if not payload.feedback.strip():
        raise HTTPException(422, detail="feedback is required.")

    try:
        send_feedback_email(
            payload,
            settings,
            request_client_ip(request),
            request.headers.get("user-agent"),
        )
    except FeedbackEmailNotConfiguredError as exc:
        raise HTTPException(503, detail=str(exc)) from exc
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(502, detail=f"Could not send feedback email: {exc}") from exc

    return FeedbackReportResponse(ok=True)


static_dir = Path(__file__).parents[1] / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
