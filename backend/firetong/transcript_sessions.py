import json
from datetime import UTC, datetime
from pathlib import Path

from backend.firetong.runtime_config import (
    REALTIME_DURATION_RATES_USD_PER_MINUTE,
    TRANSCRIPT_FILE_LANGUAGE_NAMES,
)
from backend.firetong.schemas import TranscriptSessionSaveRequest, TranscriptSessionSaveResponse


class EmptyTranscriptSessionError(ValueError):
    pass


def available_transcript_session_prefix(save_dir: Path, timestamp: str) -> str:
    prefix = timestamp
    counter = 2

    while (
        (save_dir / f"{prefix}-metadata.json").exists()
        or any((save_dir / "input").glob(f"{prefix}-*.txt"))
        or any((save_dir / "output").glob(f"{prefix}-*.txt"))
    ):
        prefix = f"{timestamp}-{counter}"
        counter += 1

    return prefix


def parse_session_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def session_duration_seconds(started_at: str | None, ended_at: str | None) -> float | None:
    started = parse_session_datetime(started_at)
    ended = parse_session_datetime(ended_at)
    if not started or not ended or ended < started:
        return None

    return round((ended - started).total_seconds(), 3)


def duration_cost_usd(model: str, duration_seconds: float | None) -> float | None:
    rate = REALTIME_DURATION_RATES_USD_PER_MINUTE.get(model)
    if rate is None or duration_seconds is None:
        return None

    return round((duration_seconds / 60) * rate, 6)


def build_cost_metadata(
    payload: TranscriptSessionSaveRequest,
    transcription_model: str,
    translation_model: str,
) -> dict:
    duration_seconds = session_duration_seconds(payload.started_at, payload.ended_at)
    sessions = [
        {
            "name": "transcription",
            "model": transcription_model,
            "pricing_basis": "duration",
            "duration_seconds": duration_seconds,
            "rate_usd_per_minute": REALTIME_DURATION_RATES_USD_PER_MINUTE.get(
                transcription_model
            ),
            "estimated_cost_usd": duration_cost_usd(transcription_model, duration_seconds),
        },
        {
            "name": "translation",
            "model": translation_model,
            "pricing_basis": "duration",
            "duration_seconds": duration_seconds,
            "rate_usd_per_minute": REALTIME_DURATION_RATES_USD_PER_MINUTE.get(translation_model),
            "estimated_cost_usd": duration_cost_usd(translation_model, duration_seconds),
        },
    ]
    session_costs = [session["estimated_cost_usd"] for session in sessions]
    total_cost = (
        round(sum(session_costs), 6)
        if duration_seconds is not None and all(cost is not None for cost in session_costs)
        else None
    )

    return {
        "currency": "USD",
        "estimated_total_usd": total_cost,
        "sessions": sessions,
    }


def save_transcript_session_files(
    payload: TranscriptSessionSaveRequest,
    save_dir: Path,
    input_language: str,
    output_language: str,
    transcription_model: str,
    translation_model: str,
) -> TranscriptSessionSaveResponse:
    source_text = payload.source_text.strip()
    translated_text = payload.translated_text.strip()
    if not source_text and not translated_text:
        raise EmptyTranscriptSessionError

    timestamp = datetime.now(UTC).strftime("%Y-%m-%d-%H-%M")
    session_prefix = available_transcript_session_prefix(save_dir, timestamp)
    input_dir = save_dir / "input"
    output_dir = save_dir / "output"
    input_path = input_dir / f"{session_prefix}-{input_language}.txt"
    output_path = output_dir / f"{session_prefix}-{output_language}.txt"
    metadata_path = save_dir / f"{session_prefix}-metadata.json"

    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    input_path.write_text(source_text + "\n", encoding="utf-8")
    output_path.write_text(translated_text + "\n", encoding="utf-8")
    cost = build_cost_metadata(
        payload,
        transcription_model,
        translation_model,
    )
    metadata_path.write_text(
        json.dumps(
            {
                "timestamp": session_prefix,
                "input_language": input_language,
                "input_language_name": TRANSCRIPT_FILE_LANGUAGE_NAMES[input_language],
                "output_language": output_language,
                "output_language_name": TRANSCRIPT_FILE_LANGUAGE_NAMES[output_language],
                "started_at": payload.started_at,
                "ended_at": payload.ended_at,
                "input_path": str(input_path),
                "output_path": str(output_path),
                "cost": cost,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    return TranscriptSessionSaveResponse(
        directory=str(save_dir),
        input_path=str(input_path),
        output_path=str(output_path),
        metadata_path=str(metadata_path),
        cost=cost,
    )
