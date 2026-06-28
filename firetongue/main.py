from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from firetongue.schemas import AppConfig
from firetongue.settings import Settings, get_settings


app = FastAPI(title="FireTongue MVP")


@app.get("/api/config", response_model=AppConfig)
def read_config(settings: Settings = Depends(get_settings)) -> AppConfig:
    return AppConfig(
        openai_base_url=str(settings.openai_base_url).rstrip("/"),
        translation_model=settings.translation_model,
        transcription_model=settings.transcription_model,
        chunk_seconds=settings.chunk_seconds,
    )


static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
