from pathlib import Path
import json


STATIC_DIR = Path("firetong/static")


def test_browser_app_supports_audio_capture_for_openai_realtime_translation():
    app_js = (STATIC_DIR / "app.js").read_text()
    app_core_js = (STATIC_DIR / "app-core.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="load-model-button"' not in index_html
    assert "/api/realtime/token" in app_js
    assert "/api/realtime/translation-token" in app_js
    assert "RTCPeerConnection" in app_js
    assert 'createDataChannel("oai-events")' in app_js
    assert "conversation.item.input_audio_transcription.delta" in app_js
    assert "conversation.item.input_audio_transcription.completed" in app_js
    assert "session.output_transcript.delta" in app_js
    assert "session.input_transcript.delta" in app_js
    assert "/realtime/translations/calls" in app_js
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


def test_browser_app_uses_realtime_translation_only():
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
    assert "Realtime transcription and translation test passed." in app_js
    assert "OpenAI API ready" in app_js
    assert "config.translation_model" not in app_js
    assert "config.realtime_translation_model" in app_js
    assert "Using built-in browser defaults." in app_js
    assert "/api/translate" not in app_js
    assert "chat/completions" not in app_js


def test_live_capture_wires_both_transcription_and_translation_sessions():
    app_js = (STATIC_DIR / "app.js").read_text()

    assert "startRealtimeTranscription(audioTracks)" in app_js
    assert "startRealtimeTranslation(audioTracks)" in app_js
    assert 'fetch("/api/realtime/token")' in app_js
    assert 'fetch("/api/realtime/translation-token")' in app_js
    assert 'fetch(`${config.openai_base_url}/realtime/calls`' in app_js
    assert 'fetch(`${config.openai_base_url}/realtime/translations/calls`' in app_js
    assert "conversation.item.input_audio_transcription.delta" in app_js
    assert "conversation.item.input_audio_transcription.completed" in app_js
    assert "input_audio_buffer.commit" in app_js
    assert "session.output_transcript.delta" in app_js
    assert "appendTranslatedText(event.delta || \"\")" in app_js
    assert "session.input_transcript.delta" in app_js
    assert "sourceFromTranscription" in app_js
    assert "audioTracks[0].clone()" in app_js
    assert 'direction: "sendonly"' in app_js
    assert "forceSendOnlyAudioSdp" in app_js
    assert 'replaceAll("a=sendrecv", "a=sendonly")' in app_js
    assert 'replaceAll("a=recvonly", "a=inactive")' in app_js
    assert "translatedAudio" not in app_js


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


def test_browser_app_streams_translated_text():
    app_js = (STATIC_DIR / "app.js").read_text()
    index_html = (STATIC_DIR / "index.html").read_text()
    styles_css = (STATIC_DIR / "styles.css").read_text()

    assert 'id="live-translation"' in index_html
    assert "appendTranslatedText" in app_js
    assert "translatedAudio" not in app_js
    assert ".live-translation" in styles_css
    assert "Live draft" in styles_css


def test_browser_app_commits_transcription_audio_buffers():
    app_js = (STATIC_DIR / "app.js").read_text()

    assert "TRANSCRIPTION_COMMIT_IDLE_MS" in app_js
    assert "scheduleTranscriptionCommit" in app_js
    assert "input_audio_buffer.commit" in app_js
    assert "waitForPendingTranscription" not in app_js


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


def test_service_worker_replaces_stale_cached_app_shell():
    service_worker = (STATIC_DIR / "service-worker.js").read_text()

    assert "firetong-mvp-v14" in service_worker
    assert "self.skipWaiting()" in service_worker
    assert "self.clients.claim()" in service_worker
    assert "caches.delete(cacheName)" in service_worker
