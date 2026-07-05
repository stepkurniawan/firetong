from typing import Any

from pydantic import BaseModel, Field


class RealtimeLanguageOption(BaseModel):
    value: str
    label: str


class AppConfig(BaseModel):
    openai_base_url: str
    transcription_model: str
    realtime_input_language: str
    realtime_translation_model: str
    realtime_translation_language: str
    realtime_language_options: list[RealtimeLanguageOption]
    realtime_duration_rates_usd_per_minute: dict[str, float]


class RealtimeTokenResponse(BaseModel):
    value: str


class TranscriptSessionSaveRequest(BaseModel):
    source_text: str = ""
    translated_text: str
    input_language: str
    output_language: str
    started_at: str | None = None
    ended_at: str | None = None


class TranscriptSessionCostItem(BaseModel):
    name: str
    model: str
    pricing_basis: str
    duration_seconds: float | None = None
    rate_usd_per_minute: float | None = None
    estimated_cost_usd: float | None = None


class TranscriptSessionCost(BaseModel):
    currency: str
    estimated_total_usd: float | None = None
    sessions: list[TranscriptSessionCostItem]


class TranscriptSessionSaveResponse(BaseModel):
    directory: str
    input_path: str | None = None
    output_path: str
    metadata_path: str
    cost: TranscriptSessionCost


class FeedbackReportRequest(BaseModel):
    feedback: str
    source_transcript: str = ""
    translated_transcript: str = ""
    input_language: str
    input_language_label: str
    output_language: str
    output_language_label: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeedbackReportResponse(BaseModel):
    ok: bool
