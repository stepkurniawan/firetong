from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from httpx import AsyncClient, HTTPError
from jinja2 import Environment, FileSystemLoader, select_autoescape

from firetong.schemas import (
    AppConfig,
    RealtimeTokenResponse,
    TranslationRequest,
    TranslationResponse,
)
from firetong.settings import Settings, get_settings


app = FastAPI(title="FireTong MVP")
prompt_dir = Path(__file__).parent / "prompts"
prompt_environment = Environment(
    autoescape=select_autoescape(default_for_string=False),
    loader=FileSystemLoader(prompt_dir),
    trim_blocks=True,
    lstrip_blocks=True,
)


@app.get("/api/config", response_model=AppConfig)
def read_config(settings: Settings = Depends(get_settings)) -> AppConfig:
    return AppConfig(
        openai_base_url=str(settings.openai_base_url).rstrip("/"),
        translation_model=settings.translation_model,
        live_translation_debounce_ms=settings.live_translation_debounce_ms,
        live_translation_force_words=settings.live_translation_force_words,
    )


async def post_to_openai(
    settings: Settings,
    path: str,
    json_data=None,
    form_data=None,
    files=None,
):
    if not settings.openai_api_key:
        raise HTTPException(503, detail="OpenAI API key is not configured on the server.")

    url = str(settings.openai_base_url).rstrip("/") + path
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}

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


@app.get("/api/realtime/token", response_model=RealtimeTokenResponse)
async def create_realtime_token(
    settings: Settings = Depends(get_settings),
) -> RealtimeTokenResponse:
    response = await post_to_openai(
        settings,
        "/realtime/client_secrets",
        json_data={
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "transcription": {
                            "model": settings.transcription_model,
                            "language": "id",
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


def render_prompt(template_name: str, **context) -> str:
    template = prompt_environment.get_template(template_name)
    return template.render(**context).strip()


def build_translation_user_message(request: TranslationRequest) -> str:
    if not request.context_source_text and not request.context_translation and request.mode == "final":
        return request.source_text

    return "\n\n".join(
        [
            f"Mode: {request.mode}",
            "Previous Indonesian context:\n"
            f"{request.context_source_text or '(none)'}",
            "Previous English context:\n"
            f"{request.context_translation or '(none)'}",
            "Current Indonesian source to translate:\n"
            f"{request.source_text}",
            "Return only the English translation for the current Indonesian source.",
        ]
    )


@app.post("/api/translate", response_model=TranslationResponse)
async def translate_text(
    request: TranslationRequest,
    settings: Settings = Depends(get_settings),
) -> TranslationResponse:
    system_prompt = render_prompt(
        "translation_system.jinja2",
        source_language="Indonesian",
        target_language="English",
    )
    response = await post_to_openai(
        settings,
        "/chat/completions",
        json_data={
            "model": settings.translation_model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {"role": "user", "content": build_translation_user_message(request)},
            ],
            "temperature": 0.2,
        },
    )

    translation = ""
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        translation = choices[0].get("message", {}).get("content", "")

    return TranslationResponse(translation=(translation or "").strip())


static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
