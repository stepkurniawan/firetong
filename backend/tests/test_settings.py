from pathlib import Path

from backend.firetong.runtime_config import (
    DEFAULT_TRANSCRIPTION_PROMPT,
    render_transcription_prompt,
)
from backend.firetong.settings import Settings


def test_default_transcription_prompt_loads_from_template():
    prompt_template = Path("backend/firetong/prompts/transcription_prompt.jinja2")

    assert DEFAULT_TRANSCRIPTION_PROMPT == prompt_template.read_text(encoding="utf-8").strip()


def test_transcription_prompt_template_renders_language_context():
    prompt = render_transcription_prompt(
        "Transcribe {{ input_language_name }} ({{ input_language }}) without translating to "
        "{{ output_language_name }} ({{ output_language }}).",
        "id",
        "en",
    )

    assert prompt == "Transcribe Indonesian (id) without translating to English (en)."


def test_settings_read_firetong_environment(monkeypatch):
    monkeypatch.setenv("FIRETONG_TRANSCRIPTION_MODEL", "gpt-realtime-test")
    monkeypatch.setenv("FIRETONG_REALTIME_INPUT_LANGUAGE", "en")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSLATION_MODEL", "gpt-realtime-translate-test")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSLATION_LANGUAGE", "de")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSCRIPTION_DELAY", "minimal")
    monkeypatch.setenv(
        "FIRETONG_TRANSCRIPTION_PROMPT",
        "Transcribe {{ input_language_name }} precisely.",
    )
    monkeypatch.setenv("FIRETONG_TRANSCRIPT_SAVE_DIR", "/tmp/firetong-test-transcripts")

    settings = Settings(_env_file=None)

    assert settings.transcription_model == "gpt-realtime-test"
    assert settings.realtime_input_language == "en"
    assert settings.realtime_translation_model == "gpt-realtime-translate-test"
    assert settings.realtime_translation_language == "de"
    assert settings.realtime_transcription_delay == "minimal"
    assert settings.transcription_prompt == "Transcribe {{ input_language_name }} precisely."
    assert str(settings.transcript_save_dir) == "/tmp/firetong-test-transcripts"
