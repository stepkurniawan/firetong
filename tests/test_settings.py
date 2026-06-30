from firetong.settings import Settings


def test_settings_read_firetong_environment(monkeypatch):
    monkeypatch.setenv("FIRETONG_TRANSLATION_MODEL", "gpt-test")
    monkeypatch.setenv("FIRETONG_TRANSCRIPTION_MODEL", "gpt-realtime-test")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSCRIPTION_DELAY", "minimal")

    settings = Settings()

    assert settings.translation_model == "gpt-test"
    assert settings.transcription_model == "gpt-realtime-test"
    assert settings.realtime_transcription_delay == "minimal"
