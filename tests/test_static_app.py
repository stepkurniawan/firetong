from pathlib import Path
import json


STATIC_DIR = Path("firetong/static")


def test_browser_app_supports_audio_capture_for_openai_stt():
    app_js = (STATIC_DIR / "app.js").read_text()
    app_core_js = (STATIC_DIR / "app-core.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="load-model-button"' not in index_html
    assert "/api/realtime/token" in app_js
    assert "RTCPeerConnection" in app_js
    assert 'createDataChannel("oai-events")' in app_js
    assert "conversation.item.input_audio_transcription.delta" in app_js
    assert "conversation.item.input_audio_transcription.completed" in app_js
    assert "/api/transcribe" not in app_js
    assert 'form.append("language", "id")' not in app_js
    assert "MediaRecorder" not in app_js
    assert "decodeToMono16k" not in app_js
    assert "audio/transcriptions" not in app_js
    assert "Xenova" not in app_js
    assert "Xenova" not in app_core_js
    assert "loadModelButton" not in app_js
    assert "createPauseDetector" not in app_core_js
    assert "recorder.requestData()" not in app_js
    assert "Processing phrase..." not in app_js
    assert 'id="chunk-seconds"' not in index_html


def test_browser_app_calls_backend_translation():
    app_js = (STATIC_DIR / "app.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="api-key"' not in index_html
    assert 'id="save-key-button"' not in index_html
    assert 'id="translate-button"' not in index_html
    assert 'id="source-text" readonly' in index_html
    assert 'id="test-openai-button"' in index_html
    assert 'id="load-model-button"' not in index_html
    assert "testServerConnection" in app_js
    assert "translateCurrentText" not in app_js
    assert "Backend translation test passed." in app_js
    assert "OpenAI API ready (live translation" in app_js
    assert "config.realtime_transcription_model" not in app_js
    assert "config.translation_model" in app_js
    assert "Using built-in browser defaults." in app_js
    assert "/api/translate" in app_js
    assert "chat/completions" not in app_js


def test_browser_app_supports_transcript_export():
    app_js = (STATIC_DIR / "app.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="export-button"' in index_html
    assert "firetong-transcript.txt" in app_js


def test_browser_app_reports_runtime_metrics():
    app_js = (STATIC_DIR / "app.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="capture-state"' in index_html
    assert 'id="phrase-count"' in index_html
    assert 'id="last-latency"' in index_html
    assert "recordPhraseLatency" in app_js
    assert "setRuntimeState" in app_js


def test_browser_app_marks_revisable_live_translation():
    app_js = (STATIC_DIR / "app.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()
    styles_css = (STATIC_DIR / "styles.css").read_text()

    assert 'id="live-translation"' in index_html
    assert "config.live_translation_debounce_ms" in app_js
    assert "config.live_translation_force_words" in app_js
    assert "context_source_text" in app_js
    assert "mode: options.mode" in app_js
    assert ".live-translation" in styles_css


def test_browser_app_commits_realtime_audio_for_automatic_translation():
    app_js = (STATIC_DIR / "app.js").read_text()

    assert "TRANSCRIPTION_COMMIT_IDLE_MS" in app_js
    assert "scheduleTranscriptionCommit" in app_js
    assert "input_audio_buffer.commit" in app_js
    assert "waitForPendingTranscription" in app_js


def test_browser_app_checks_capture_prerequisites():
    app_js = (STATIC_DIR / "app.js").read_text()
    app_core_js = (STATIC_DIR / "app-core.js").read_text()

    assert "missingBrowserFeatures" in app_core_js
    assert "checkBrowserSupport" in app_js
    assert "getDisplayMedia" in app_core_js
    assert "RTCPeerConnection" in app_core_js


def test_pwa_manifest_declares_install_icons():
    manifest = json.loads((STATIC_DIR / "manifest.webmanifest").read_text())
    service_worker = (STATIC_DIR / "service-worker.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    icon_paths = {icon["src"] for icon in manifest["icons"]}
    assert "/icon.svg" in icon_paths
    assert "/icon-maskable.svg" in icon_paths
    assert 'rel="icon"' in index_html
    assert "/icon.svg" in service_worker
    assert "/icon-maskable.svg" in service_worker
    assert (STATIC_DIR / "icon.svg").exists()
    assert (STATIC_DIR / "icon-maskable.svg").exists()
