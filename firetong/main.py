from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from httpx import AsyncClient, HTTPError

from firetong.schemas import (
    AppConfig,
    RealtimeTokenResponse,
)
from firetong.settings import Settings, get_settings


app = FastAPI(title="FireTong MVP")


@app.get("/api/config", response_model=AppConfig)
def read_config(settings: Settings = Depends(get_settings)) -> AppConfig:
    return AppConfig(
        openai_base_url=str(settings.openai_base_url).rstrip("/"),
        realtime_translation_model=settings.realtime_translation_model,
        realtime_translation_language=settings.realtime_translation_language,
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


@app.get("/api/realtime/translation-token", response_model=RealtimeTokenResponse)
async def create_realtime_translation_token(
    settings: Settings = Depends(get_settings),
) -> RealtimeTokenResponse:
    response = await post_to_openai(
        settings,
        "/realtime/translations/client_secrets",
        json_data={
            "session": {
                "model": settings.realtime_translation_model,
                "audio": {
                    "output": {
                        "language": settings.realtime_translation_language,
                    },
                },
            }
        },
    )

    client_secret = response.get("value")
    if not client_secret:
        raise HTTPException(502, detail="OpenAI did not return a realtime translation client secret.")

    return RealtimeTokenResponse(value=client_secret)


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


static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
