from firetongue.settings import Settings


def test_settings_read_firetongue_environment(monkeypatch):
    monkeypatch.setenv("FIRETONGUE_TRANSLATION_MODEL", "gpt-test")
    monkeypatch.setenv("FIRETONGUE_TRANSCRIPTION_MODEL", "Xenova/whisper-base")
    monkeypatch.setenv("FIRETONGUE_CHUNK_SECONDS", "3")

    settings = Settings()

    assert settings.translation_model == "gpt-test"
    assert settings.transcription_model == "Xenova/whisper-base"
    assert settings.chunk_seconds == 3
