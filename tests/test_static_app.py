from pathlib import Path
import json


STATIC_DIR = Path("firetong/static")


def test_browser_app_supports_audio_capture_for_openai_stt():
    app_js = (STATIC_DIR / "app.js").read_text()
    app_core_js = (STATIC_DIR / "app-core.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="load-model-button"' in index_html
    assert "audio/transcriptions" in app_js
    assert "decodeToMono16k" not in app_js
    assert "createPauseDetector" in app_core_js
    assert "recorder.requestData()" in app_js
    assert "/api/transcribe" not in app_js


def test_browser_app_calls_openai_translation_directly():
    app_js = (STATIC_DIR / "app.js").read_text()
    app_core_js = (STATIC_DIR / "app-core.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert "chat/completions" in app_core_js
    assert "SERMON_TRANSLATOR_PROMPT" in app_core_js
    assert "firetong.openai_api_key" in app_js
    assert 'id="test-openai-button"' in index_html
    assert "testOpenAIConnection" in app_js
    assert "Using built-in browser defaults." in app_js
    assert "/api/translate" not in app_js


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


def test_browser_app_checks_capture_prerequisites():
    app_js = (STATIC_DIR / "app.js").read_text()
    app_core_js = (STATIC_DIR / "app-core.js").read_text()

    assert "missingBrowserFeatures" in app_core_js
    assert "checkBrowserSupport" in app_js
    assert "getDisplayMedia" in app_core_js
    assert "MediaRecorder" in app_core_js


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
