from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from httpx import AsyncClient, HTTPError
from jinja2 import Environment, FileSystemLoader, select_autoescape

from firetong.schemas import (
    AppConfig,
    TranscriptionResponse,
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
        transcription_model=settings.transcription_model,
        chunk_seconds=settings.chunk_seconds,
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


def render_prompt(template_name: str, **context) -> str:
    template = prompt_environment.get_template(template_name)
    return template.render(**context).strip()


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
                {"role": "user", "content": request.source_text},
            ],
            "temperature": 0.2,
        },
    )

    translation = ""
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        translation = choices[0].get("message", {}).get("content", "")

    return TranslationResponse(translation=(translation or "").strip())


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("indonesian"),
    settings: Settings = Depends(get_settings),
) -> TranscriptionResponse:
    file_bytes = await file.read()
    files = {
        "file": (
            file.filename,
            file_bytes,
            file.content_type or "application/octet-stream",
        )
    }
    response = await post_to_openai(
        settings,
        "/audio/transcriptions",
        form_data={"model": settings.transcription_model, "language": language},
        files=files,
    )

    return TranscriptionResponse(text=(response.get("text", "") or "").strip())


static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
