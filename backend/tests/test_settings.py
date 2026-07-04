from backend.firetong.settings import Settings


def test_settings_read_firetong_environment(monkeypatch):
    monkeypatch.setenv("FIRETONG_TRANSCRIPTION_MODEL", "gpt-realtime-test")
    monkeypatch.setenv("FIRETONG_REALTIME_INPUT_LANGUAGE", "en")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSLATION_MODEL", "gpt-realtime-translate-test")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSLATION_LANGUAGE", "de")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSCRIPTION_DELAY", "minimal")
    monkeypatch.setenv("FIRETONG_TRANSCRIPT_SAVE_DIR", "/tmp/firetong-test-transcripts")

    settings = Settings()

    assert settings.transcription_model == "gpt-realtime-test"
    assert settings.realtime_input_language == "en"
    assert settings.realtime_translation_model == "gpt-realtime-translate-test"
    assert settings.realtime_translation_language == "de"
    assert settings.realtime_transcription_delay == "minimal"
    assert str(settings.transcript_save_dir) == "/tmp/firetong-test-transcripts"
