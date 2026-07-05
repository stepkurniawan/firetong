from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.firetong.runtime_config import (
    DEFAULT_OPENAI_BASE_URL,
    DEFAULT_REALTIME_INPUT_LANGUAGE,
    DEFAULT_REALTIME_TRANSCRIPTION_DELAY,
    DEFAULT_REALTIME_TRANSLATION_LANGUAGE,
    DEFAULT_REALTIME_TRANSLATION_MODEL,
    DEFAULT_TRANSCRIPTION_MODEL,
)


class Settings(BaseSettings):
    openai_base_url: AnyHttpUrl = DEFAULT_OPENAI_BASE_URL
    openai_api_key: str | None = None
    transcription_model: str = DEFAULT_TRANSCRIPTION_MODEL
    realtime_input_language: str = DEFAULT_REALTIME_INPUT_LANGUAGE
    realtime_translation_model: str = DEFAULT_REALTIME_TRANSLATION_MODEL
    realtime_translation_language: str = DEFAULT_REALTIME_TRANSLATION_LANGUAGE
    realtime_transcription_delay: str = DEFAULT_REALTIME_TRANSCRIPTION_DELAY
    transcript_save_dir: Path = Path("saved-sessions")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FIRETONG_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
