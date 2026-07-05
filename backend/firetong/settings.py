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
    DEFAULT_TRANSCRIPTION_PROMPT,
)


class Settings(BaseSettings):
    openai_base_url: AnyHttpUrl = DEFAULT_OPENAI_BASE_URL
    openai_api_key: str | None = None
    transcription_model: str = DEFAULT_TRANSCRIPTION_MODEL
    realtime_input_language: str = DEFAULT_REALTIME_INPUT_LANGUAGE
    realtime_translation_model: str = DEFAULT_REALTIME_TRANSLATION_MODEL
    realtime_translation_language: str = DEFAULT_REALTIME_TRANSLATION_LANGUAGE
    realtime_transcription_delay: str = DEFAULT_REALTIME_TRANSCRIPTION_DELAY
    transcription_prompt: str = DEFAULT_TRANSCRIPTION_PROMPT
    transcript_save_dir: Path = Path("saved-sessions")
    feedback_email_to: str = "stepkurniawan.learn@gmail.com"
    feedback_email_from: str | None = None
    feedback_smtp_host: str | None = None
    feedback_smtp_port: int = 587
    feedback_smtp_username: str | None = None
    feedback_smtp_password: str | None = None
    feedback_smtp_starttls: bool = True
    feedback_smtp_ssl: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FIRETONG_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
