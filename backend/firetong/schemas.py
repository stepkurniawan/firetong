from pydantic import BaseModel


class AppConfig(BaseModel):
    openai_base_url: str
    realtime_input_language: str
    realtime_translation_model: str
    realtime_translation_language: str


class RealtimeTokenResponse(BaseModel):
    value: str


class TranscriptSessionSaveRequest(BaseModel):
    source_text: str = ""
    translated_text: str = ""
    input_language: str
    output_language: str
    started_at: str | None = None
    ended_at: str | None = None


class TranscriptSessionSaveResponse(BaseModel):
    directory: str
    input_path: str
    output_path: str
    metadata_path: str
