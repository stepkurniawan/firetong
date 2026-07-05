from pathlib import Path

APP_CORE_TS = Path("frontend/src/app-core.ts")


def test_browser_core_defaults_are_defined_for_runtime_config():
    app_core = APP_CORE_TS.read_text()

    assert 'openai_base_url: "https://api.openai.com/v1"' in app_core
    assert 'transcription_model: "gpt-realtime-whisper"' in app_core
    assert 'realtime_input_language: "id"' in app_core
    assert 'realtime_translation_model: "gpt-realtime-translate"' in app_core
    assert 'realtime_translation_language: "en"' in app_core
    assert "realtime_language_options: FALLBACK_REALTIME_LANGUAGE_OPTIONS" in app_core
    assert "realtime_duration_rates_usd_per_minute" in app_core
    assert 'value: "de", label: "German"' in app_core


def test_browser_core_feature_check_reports_capture_prerequisites():
    app_core = APP_CORE_TS.read_text()

    assert 'missing.push("audio capture")' in app_core
    assert 'missing.push("realtime audio streaming")' in app_core
    assert 'missing.push("audio analysis")' in app_core
    assert "getDisplayMedia" in app_core
    assert "getUserMedia" in app_core
    assert "RTCPeerConnection" in app_core
    assert "AudioContext" in app_core
