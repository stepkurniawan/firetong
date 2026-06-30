from functools import lru_cache

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_base_url: AnyHttpUrl = "https://api.openai.com/v1"
    openai_api_key: str | None = None
    translation_model: str = "gpt-4o-mini"
    transcription_model: str = "gpt-realtime-whisper"
    realtime_transcription_delay: str = "low"
    live_translation_debounce_ms: int = 2000
    live_translation_force_words: int = 20

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FIRETONG_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
