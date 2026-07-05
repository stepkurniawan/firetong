import json
from pathlib import Path

STATIC_DIR = Path("backend/static")
SRC_DIR = Path("frontend/src")


def read_frontend_source() -> tuple[str, str, str, str]:
    app_svelte = "\n".join(
        [
            (SRC_DIR / "App.svelte").read_text(),
            (SRC_DIR / "LiveTranslationControls.svelte").read_text(),
            (SRC_DIR / "TranscriptPanels.svelte").read_text(),
        ]
    )
    realtime_ts = "\n".join(
        [
            (SRC_DIR / "realtime.ts").read_text(),
            (SRC_DIR / "realtime-events.ts").read_text(),
        ]
    )
    app_core_ts = (SRC_DIR / "app-core.ts").read_text()
    styles_css = (SRC_DIR / "styles.css").read_text()
    return app_svelte, realtime_ts, app_core_ts, styles_css


def test_browser_app_supports_audio_capture_for_openai_realtime_translation():
    app_svelte, realtime_ts, app_core_ts, _ = read_frontend_source()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="load-model-button"' not in index_html
    assert "/api/realtime/token" in realtime_ts
    assert "/api/realtime/translation-token" in realtime_ts
    assert "RTCPeerConnection" in realtime_ts
    assert 'createDataChannel("oai-events")' in realtime_ts
    assert "conversation.item.input_audio_transcription.delta" in realtime_ts
    assert "conversation.item.input_audio_transcription.completed" in realtime_ts
    assert "session.output_transcript.delta" in realtime_ts
    assert "session.input_transcript.delta" in realtime_ts
    assert "/realtime/translations/calls" in realtime_ts
    assert "/api/transcribe" not in realtime_ts
    assert 'form.append("language", "id")' not in realtime_ts
    assert "MediaRecorder" not in realtime_ts
    assert "decodeToMono16k" not in realtime_ts
    assert "audio/transcriptions" not in realtime_ts
    assert "Xenova" not in realtime_ts
    assert "Xenova" not in app_core_ts
    assert "loadModelButton" not in app_svelte
    assert "createPauseDetector" not in app_core_ts
    assert "recorder.requestData()" not in realtime_ts
    assert "Processing phrase..." not in app_svelte
    assert 'id="chunk-seconds"' not in index_html


def test_browser_app_uses_realtime_translation_only():
    app_svelte, realtime_ts, _, _ = read_frontend_source()
    index_html = (STATIC_DIR / "index.html").read_text()

    assert 'id="api-key"' not in index_html
    assert 'id="save-key-button"' not in index_html
    assert 'id="translate-button"' not in index_html
    assert "readonly" in app_svelte
    assert "Check connection" in app_svelte
    assert "load-model-button" not in app_svelte
    assert "testServerConnection" in app_svelte
    assert "translateCurrentText" not in app_svelte
    assert "Realtime transcription and translation test passed." in app_svelte
    assert "OpenAI API ready" not in app_svelte
    assert "OpenAI API key override" not in app_svelte
    assert "firetong.openaiApiKeyOverride" not in app_svelte
    assert "X-OpenAI-API-Key" not in app_svelte + realtime_ts
    assert "config.translation_model" not in app_svelte
    assert "Using built-in browser defaults." in app_svelte
    assert "/api/translate" not in app_svelte + realtime_ts
    assert "chat/completions" not in app_svelte + realtime_ts


def test_live_capture_wires_both_transcription_and_translation_sessions():
    app_svelte, realtime_ts, _, _ = read_frontend_source()

    assert "options.inputTranscriptEnabled" in realtime_ts
    assert "this.startRealtimeTranscription(audioTracks, options.inputLanguage)" in realtime_ts
    assert "this.startRealtimeTranslation(audioTracks, options.outputLanguage)" in realtime_ts
    assert '"/api/realtime/token"' in realtime_ts
    assert '"/api/realtime/translation-token"' in realtime_ts
    assert "input_language" in app_svelte + realtime_ts
    assert "output_language" in app_svelte + realtime_ts
    assert "openaiApiKeyHeaders()" not in realtime_ts
    assert "fetch(`${this.config.openai_base_url}/realtime/calls`" in realtime_ts
    assert "fetch(`${this.config.openai_base_url}/realtime/translations/calls`" in realtime_ts
    assert "conversation.item.input_audio_transcription.delta" in realtime_ts
    assert "conversation.item.input_audio_transcription.completed" in realtime_ts
    assert "input_audio_buffer.commit" in realtime_ts
    assert "session.output_transcript.delta" in realtime_ts
    assert "onTranslationDelta: appendTranslatedText" in app_svelte
    assert "session.input_transcript.delta" in realtime_ts
    assert "sourceFromTranscription" in realtime_ts
    assert "audioTracks[0].clone()" in realtime_ts
    assert ".addTrack(audioTrack, audioStream)" in realtime_ts
    assert "scheduleTranscriptionCommitIfReady" in realtime_ts
    assert "remoteAudio" in realtime_ts
    assert "translatedAudio" not in app_svelte + realtime_ts


def test_browser_app_omits_transcript_export_for_now():
    app_svelte, _, _, _ = read_frontend_source()

    assert "Copy" not in app_svelte
    assert "Export" not in app_svelte
    assert "firetong-transcript.txt" not in app_svelte


def test_browser_app_autosaves_transcript_sessions():
    app_svelte, _, _, _ = read_frontend_source()
    transcript_sessions_ts = (SRC_DIR / "transcript-sessions.ts").read_text()

    assert "saveTranscriptSession" in app_svelte
    assert 'fetch("/api/transcript-sessions"' in transcript_sessions_ts
    assert "inputTranscriptEnabled = false" in app_svelte
    assert "bind:inputTranscriptEnabled" in app_svelte
    assert (
        'sourceText: inputTranscriptEnabledForSession ? sessionSourceTranscript : ""' in app_svelte
    )
    assert "source_text" in transcript_sessions_ts
    assert "translated_text" in transcript_sessions_ts


def test_browser_app_omits_runtime_metrics_for_now():
    app_svelte, _, _, _ = read_frontend_source()

    assert "runtimeState" not in app_svelte
    assert "completedPhraseCount" not in app_svelte
    assert "lastLatency" not in app_svelte
    assert "recordPhraseLatency" not in app_svelte
    assert "Runtime metrics" not in app_svelte


def test_browser_app_streams_translated_text():
    app_svelte, realtime_ts, _, styles_css = read_frontend_source()

    assert "translatedTranscript" in app_svelte
    assert "appendTranslatedText" in app_svelte
    assert "onTranslationDelta" in realtime_ts
    assert "translatedAudio" not in app_svelte + realtime_ts
    assert ".panels" in styles_css


def test_transcript_panels_keep_fixed_height_and_scroll_internally():
    app_svelte, _, _, styles_css = read_frontend_source()

    assert "height: clamp(430px, 58vh, 680px);" in styles_css
    assert "height: clamp(340px, 42vh, 480px);" in styles_css
    assert "class:panels-output-only={!sourceTranscriptEnabled}" in app_svelte
    assert "{#if sourceTranscriptEnabled}" in app_svelte
    assert ".panels-output-only {\n  grid-template-columns: minmax(0, 1fr);" in styles_css
    assert ".transcript-surface {\n  min-height: 0;\n  overflow: auto;" in styles_css
    assert ".transcript-surface p {\n  max-width: 72ch;" in styles_css
    assert ".panels-output-only .transcript-surface p {\n  max-width: 96ch;" in styles_css
    assert "font-size: 18px;" in styles_css
    assert "translatedTextarea.scrollTop = translatedTextarea.scrollHeight" in app_svelte


def test_browser_app_commits_transcription_audio_buffers():
    _, realtime_ts, _, _ = read_frontend_source()

    assert "TRANSCRIPTION_COMMIT_IDLE_MS" in realtime_ts
    assert "scheduleTranscriptionCommit" in realtime_ts
    assert "input_audio_buffer.commit" in realtime_ts
    assert "waitForPendingTranscription" not in realtime_ts


def test_browser_app_checks_capture_prerequisites():
    app_svelte, _, app_core_ts, _ = read_frontend_source()

    assert "missingBrowserFeatures" in app_core_ts
    assert "checkBrowserSupport" in app_svelte
    assert "getDisplayMedia" in app_core_ts
    assert "RTCPeerConnection" in app_core_ts


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

    assert "firetong-mvp-v16" in service_worker
    assert "skipWaiting()" in service_worker
    assert "clients.claim()" in service_worker
    assert "caches.delete(cacheName)" in service_worker


def test_static_app_is_vite_build_output():
    index_html = (STATIC_DIR / "index.html").read_text()
    assets = list((STATIC_DIR / "assets").iterdir())

    assert 'id="app"' in index_html
    assert any(path.suffix == ".js" for path in assets)
    assert any(path.suffix == ".css" for path in assets)
