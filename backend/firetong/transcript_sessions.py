import json
from datetime import UTC, datetime
from pathlib import Path

from backend.firetong.schemas import TranscriptSessionSaveRequest, TranscriptSessionSaveResponse

TRANSCRIPT_FILE_LANGUAGE_NAMES = {
    "id": "indonesian",
    "en": "english",
    "de": "german",
}


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


def save_transcript_session_files(
    payload: TranscriptSessionSaveRequest,
    save_dir: Path,
    input_language: str,
    output_language: str,
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
    )
