from pydantic import BaseModel


class AppConfig(BaseModel):
    openai_base_url: str
    translation_model: str
    live_translation_debounce_ms: int
    live_translation_force_words: int


class TranslationRequest(BaseModel):
    source_text: str
    context_source_text: str = ""
    context_translation: str = ""
    mode: str = "final"


class TranslationResponse(BaseModel):
    translation: str


class RealtimeTokenResponse(BaseModel):
    value: str
