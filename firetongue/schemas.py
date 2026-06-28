from pydantic import BaseModel


class AppConfig(BaseModel):
    openai_base_url: str
    translation_model: str
    transcription_model: str
    chunk_seconds: int
