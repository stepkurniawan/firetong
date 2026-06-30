from firetong.settings import Settings


def test_settings_read_firetong_environment(monkeypatch):
    monkeypatch.setenv("FIRETONG_TRANSLATION_MODEL", "gpt-test")
    monkeypatch.setenv("FIRETONG_TRANSCRIPTION_MODEL", "gpt-realtime-test")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSLATION_MODEL", "gpt-realtime-translate-test")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSLATION_LANGUAGE", "de")
    monkeypatch.setenv("FIRETONG_REALTIME_TRANSCRIPTION_DELAY", "minimal")
    monkeypatch.setenv("FIRETONG_LIVE_TRANSLATION_DEBOUNCE_MS", "1500")
    monkeypatch.setenv("FIRETONG_LIVE_TRANSLATION_FORCE_WORDS", "18")

    settings = Settings()

    assert settings.translation_model == "gpt-test"
    assert settings.transcription_model == "gpt-realtime-test"
    assert settings.realtime_translation_model == "gpt-realtime-translate-test"
    assert settings.realtime_translation_language == "de"
    assert settings.realtime_transcription_delay == "minimal"
    assert settings.live_translation_debounce_ms == 1500
    assert settings.live_translation_force_words == 18
