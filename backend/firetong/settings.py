from functools import lru_cache

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_base_url: AnyHttpUrl = "https://api.openai.com/v1"
    openai_api_key: str | None = None
    transcription_model: str = "gpt-realtime-whisper"
    realtime_translation_model: str = "gpt-realtime-translate"
    realtime_translation_language: str = "en"
    realtime_transcription_delay: str = "low"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FIRETONG_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
