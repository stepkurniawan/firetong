from pydantic import BaseModel


class AppConfig(BaseModel):
    openai_base_url: str
    translation_model: str
    transcription_model: str
    chunk_seconds: int


class TranslationRequest(BaseModel):
    source_text: str


class TranslationResponse(BaseModel):
    translation: str


class TranscriptionResponse(BaseModel):
    text: str
