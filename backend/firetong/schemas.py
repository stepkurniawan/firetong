from pydantic import BaseModel


class AppConfig(BaseModel):
    openai_base_url: str
    realtime_input_language: str
    realtime_translation_model: str
    realtime_translation_language: str


class RealtimeTokenResponse(BaseModel):
    value: str
