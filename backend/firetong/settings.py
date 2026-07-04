from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_REALTIME_LANGUAGES = ("id", "en", "de")


class Settings(BaseSettings):
    openai_base_url: AnyHttpUrl = "https://api.openai.com/v1"
    openai_api_key: str | None = None
    transcription_model: str = "gpt-realtime-whisper"
    realtime_input_language: str = "id"
    realtime_translation_model: str = "gpt-realtime-translate"
    realtime_translation_language: str = "en"
    realtime_transcription_delay: str = "low"
    transcript_save_dir: Path = Path("saved-sessions")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FIRETONG_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
