from firetong.settings import Settings


def test_settings_read_firetong_environment(monkeypatch):
    monkeypatch.setenv("FIRETONG_TRANSLATION_MODEL", "gpt-test")
    monkeypatch.setenv("FIRETONG_TRANSCRIPTION_MODEL", "whisper-test")
    monkeypatch.setenv("FIRETONG_CHUNK_SECONDS", "3")

    settings = Settings()

    assert settings.translation_model == "gpt-test"
    assert settings.transcription_model == "whisper-test"
    assert settings.chunk_seconds == 3
