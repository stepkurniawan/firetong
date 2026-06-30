from pydantic import BaseModel


class AppConfig(BaseModel):
    openai_base_url: str
    translation_model: str


class TranslationRequest(BaseModel):
    source_text: str


class TranslationResponse(BaseModel):
    translation: str


class RealtimeTokenResponse(BaseModel):
    value: str
