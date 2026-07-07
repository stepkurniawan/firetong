<script lang="ts">
  import { onMount, tick } from "svelte";
  import { listAudioInputOptions, type AudioInputOption } from "./audio-devices";
  import {
    buildRealtimeLanguageUrl,
    DEFAULT_CONFIG,
    firstDifferentRealtimeLanguage,
    hasDistinctRealtimeLanguages,
    missingBrowserFeatures,
    realtimeLanguageLabel,
    type AppConfig,
    type RealtimeLanguage,
    type RealtimeLanguageOption,
  } from "./app-core";
  import { sendFeedbackReport } from "./feedback";
  import LiveStatus, { type LiveStatusKind } from "./LiveStatus.svelte";
  import LiveTranslationControls from "./LiveTranslationControls.svelte";
  import { RealtimeCapture, type AudioCaptureMode } from "./realtime";
  import {
    canOpenSubtitleOverlay,
    SubtitleOverlay,
    SUBTITLE_PIP_UNSUPPORTED_MESSAGE,
  } from "./subtitle-overlay";
  import TranscriptPanels from "./TranscriptPanels.svelte";
  import {
    saveTranscriptSession,
    type TranscriptSessionCost,
  } from "./transcript-sessions";
  import {
    formatDuration,
    formatUsd,
    languagePairErrorMessage,
    noAudioMessage,
    statusTitleFor,
  } from "./ui-copy";

  const ACTIVE_AUDIO_THRESHOLD = 2;
  const NO_AUDIO_TIMEOUT_MS = 4500;
  let config: AppConfig = { ...DEFAULT_CONFIG };
  let realtimeLanguageOptions: RealtimeLanguageOption[] = [
    ...DEFAULT_CONFIG.realtime_language_options,
  ];
  let capture: RealtimeCapture | null = null;

  let browserSupported = true;
  let captureActive = false;
  let testRunning = false;
  let liveStatus: LiveStatusKind = "ready";
  let statusMessage = "Choose an audio source and language pair, then start live translation.";
  let audioCaptureMode: AudioCaptureMode = "desktop";
  let inputLanguage: RealtimeLanguage = DEFAULT_CONFIG.realtime_input_language;
  let outputLanguage: RealtimeLanguage = DEFAULT_CONFIG.realtime_translation_language;
  let selectedAudioInputId = "default";
  let audioInputOptions: AudioInputOption[] = [];
  let desktopCaptureSupported = true;
  let microphoneCaptureSupported = true;

  let meterLevel = 0;

  let sourceTranscript = "";
  let translatedTranscript = "";
  let sourceTextarea: HTMLDivElement | null = null;
  let translatedTextarea: HTMLDivElement | null = null;
  let lastAudioInputAt = Date.now();
  let noAudioDetected = false;
  let sessionStartedAt: string | null = null;
  let elapsedSessionSeconds = 0;
  let lastSavedSessionCost: TranscriptSessionCost | null = null;
  let inputTranscriptEnabled = false;
  let subtitleModeEnabled = false;
  let feedbackDialog: HTMLDialogElement | null = null;
  let feedbackText = "";
  let feedbackSubmitting = false;
  let feedbackError = "";
  const subtitleOverlay = new SubtitleOverlay();

  $: if (inputLanguage === outputLanguage && !captureActive) {
    outputLanguage = firstDifferentRealtimeLanguage(inputLanguage, realtimeLanguageOptions);
  }
  $: inputLanguageLabel = realtimeLanguageLabel(inputLanguage, realtimeLanguageOptions);
  $: outputLanguageLabel = realtimeLanguageLabel(outputLanguage, realtimeLanguageOptions);
  $: languagePairValid = hasDistinctRealtimeLanguages(inputLanguage, outputLanguage);
  $: capturePending = liveStatus === "connecting";
  $: visibleStatus =
    noAudioDetected && captureActive && liveStatus === "listening" ? "no-audio" : liveStatus;
  $: visibleStatusTitle = statusTitleFor(visibleStatus);
  $: visibleStatusMessage =
    visibleStatus === "no-audio"
      ? noAudioMessage(audioCaptureMode)
      : statusMessage;
  $: displayedSessionCostUsd =
    captureActive && sessionStartedAt
      ? estimateSessionCostUsd(elapsedSessionSeconds)
      : lastSavedSessionCost?.estimated_total_usd ?? null;
  $: sessionCostTitle = captureActive ? "Current session estimate" : "Last session cost";
  $: sessionCostValue = formatUsd(displayedSessionCostUsd);
  $: sessionCostNote =
    captureActive && sessionStartedAt
      ? realtimeSessionRateUsdPerMinute() === null
        ? "Current model rates are not configured."
        : `${formatDuration(elapsedSessionSeconds)} at the current realtime rates.`
      : lastSavedSessionCost?.estimated_total_usd !== null && lastSavedSessionCost
        ? "Final estimate saved with the transcript metadata."
        : "Start a session to see the estimated realtime cost here. It has been paid gracefully.";

  const supportUrl = "https://paypal.me/stepkurniawan";
  const feedbackEmail = "stepkurniawan.learn@gmail.com";
  const linkedInUrl = "https://www.linkedin.com/in/stepkurniawan/";

  onMount(() => {
    void readConfig();
    void refreshAudioInputOptions();
    const silenceTimer = window.setInterval(updateNoAudioState, 500);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        setStatusMessage("Service worker registration failed.");
      });
    }

    return () => {
      window.clearInterval(silenceTimer);
      subtitleOverlay.close();
    };
  });

  function setStatus(status: LiveStatusKind, message: string): void {
    liveStatus = status;
    statusMessage = message;
  }

  function setStatusMessage(message: string): void {
    statusMessage = message;
  }

  function handleRealtimeState(state: string): void {
    if (state === "Connecting") {
      setStatus("connecting", "Connecting realtime transcription and translation.");
      return;
    }
    if (state === "Live") {
      setStatus("listening", "Listening and translating in real time.");
      return;
    }
    if (state === "Reconnecting") {
      setStatus("reconnecting", "The realtime connection dropped. Waiting for it to recover.");
      return;
    }
    if (state === "Error") {
      setStatus("error", "Realtime translation stopped because the connection failed.");
      return;
    }
    if (state === "Stopped") {
      setStatus("stopped", "Capture stopped. Start again when you are ready.");
    }
  }

  function updateNoAudioState(): void {
    updateElapsedSessionSeconds();

    if (!captureActive || liveStatus !== "listening") {
      noAudioDetected = false;
      return;
    }

    noAudioDetected = Date.now() - lastAudioInputAt > NO_AUDIO_TIMEOUT_MS;
  }

  function updateElapsedSessionSeconds(): void {
    if (!sessionStartedAt || !captureActive) {
      elapsedSessionSeconds = 0;
      return;
    }

    const startedAt = Date.parse(sessionStartedAt);
    if (Number.isNaN(startedAt)) {
      elapsedSessionSeconds = 0;
      return;
    }

    elapsedSessionSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  }

  function estimateSessionCostUsd(durationSeconds: number): number | null {
    const rate = realtimeSessionRateUsdPerMinute();
    if (rate === null) return null;

    return (durationSeconds / 60) * rate;
  }

  function realtimeSessionRateUsdPerMinute(): number | null {
    const translationRate =
      config.realtime_duration_rates_usd_per_minute[config.realtime_translation_model];
    const transcriptionRate = inputTranscriptEnabled
      ? config.realtime_duration_rates_usd_per_minute[config.transcription_model]
      : 0;

    if (typeof transcriptionRate !== "number" || typeof translationRate !== "number") {
      return null;
    }

    return transcriptionRate + translationRate;
  }

  function logLatency(metric: string, details: Record<string, unknown>): void {
    console.info("[firetong:latency]", {
      metric,
      ...details,
    });
  }

  function nextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  function updateMeter(levelPercent: number): void {
    meterLevel = levelPercent;
    if (levelPercent > ACTIVE_AUDIO_THRESHOLD) {
      lastAudioInputAt = Date.now();
      noAudioDetected = false;
    }
    updateNoAudioState();
  }

  function checkBrowserSupport(): boolean {
    updateCaptureSupport();
    const missing = missingBrowserFeatures(window, navigator);
    if (missing.length === 0) {
      browserSupported = true;
      return true;
    }

    browserSupported = false;
    setStatus("unsupported", `This browser is missing: ${missing.join(", ")}.`);
    return false;
  }

  function updateCaptureSupport(): void {
    desktopCaptureSupported = Boolean(navigator.mediaDevices?.getDisplayMedia);
    microphoneCaptureSupported = Boolean(navigator.mediaDevices?.getUserMedia);

    if (audioCaptureMode === "desktop" && !desktopCaptureSupported && microphoneCaptureSupported) {
      audioCaptureMode = "microphone";
    }
    if (audioCaptureMode === "microphone" && !microphoneCaptureSupported && desktopCaptureSupported) {
      audioCaptureMode = "desktop";
    }
  }

  function selectedCaptureSourceSupported(): boolean {
    return audioCaptureMode === "desktop" ? desktopCaptureSupported : microphoneCaptureSupported;
  }

  async function refreshAudioInputOptions(): Promise<void> {
    try {
      audioInputOptions = await listAudioInputOptions();

      const selectedDeviceStillExists = audioInputOptions.some(
        (device) => device.deviceId === selectedAudioInputId,
      );
      if (selectedAudioInputId !== "default" && !selectedDeviceStillExists) {
        selectedAudioInputId = "default";
      }
    } catch {
      audioInputOptions = [];
    }
  }

  async function readConfig(): Promise<void> {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        config = (await response.json()) as AppConfig;
        realtimeLanguageOptions = config.realtime_language_options;
        inputLanguage = config.realtime_input_language;
        outputLanguage = config.realtime_translation_language;
      }
    } catch {
      setStatusMessage("Using built-in browser defaults. Choose settings and start translation.");
    }

    checkBrowserSupport();
  }

  async function scrollTranscriptAreas(): Promise<void> {
    await tick();
    if (sourceTextarea) sourceTextarea.scrollTop = sourceTextarea.scrollHeight;
    if (translatedTextarea) translatedTextarea.scrollTop = translatedTextarea.scrollHeight;
  }

  async function recordTranslationRenderDelay(startedAt: number, delta: string): Promise<void> {
    await scrollTranscriptAreas();
    await nextAnimationFrame();
    logLatency("translation_delta_ui_render_delay", {
      duration_ms: Math.round(performance.now() - startedAt),
      delta_length: delta.length,
      transcript_chars: translatedTranscript.length,
    });
  }

  function resetRealtimeState(): void {
    sourceTranscript = sourceTranscript.trim();
    translatedTranscript = translatedTranscript.trim();
    subtitleOverlay.update(translatedTranscript);
    void scrollTranscriptAreas();
  }

  function markSourceProgress(delta: string): void {
    if (!delta) return;

    sourceTranscript = `${sourceTranscript}${delta}`;
    void scrollTranscriptAreas();
  }

  function appendTranslatedText(delta: string): void {
    if (!delta) return;

    const renderStartedAt = performance.now();
    translatedTranscript = `${translatedTranscript}${delta}`;
    subtitleOverlay.update(translatedTranscript);
    void recordTranslationRenderDelay(renderStartedAt, delta);
  }

  function buildCapture(): RealtimeCapture {
    return new RealtimeCapture(
      config,
      {
        onCapturingChange: (isCapturing) => {
          captureActive = isCapturing;
          if (isCapturing) {
            lastAudioInputAt = Date.now();
            noAudioDetected = false;
          }
        },
        onLog: setStatusMessage,
        onMeter: updateMeter,
        onResetTranscripts: resetRealtimeState,
        onSourceComplete: () => {},
        onSourceDelta: markSourceProgress,
        onState: handleRealtimeState,
        onTranslationDelta: appendTranslatedText,
      },
    );
  }

  async function startCapture(): Promise<void> {
    if (!languagePairValid) {
      setStatus("error", languagePairErrorMessage());
      return;
    }
    if (!checkBrowserSupport()) return;
    if (!selectedCaptureSourceSupported()) {
      const sourceLabel = audioCaptureMode === "desktop" ? "Desktop/tab" : "Microphone";
      setStatus("error", `${sourceLabel} audio capture is unavailable.`);
      return;
    }
    if (subtitleModeEnabled && !canOpenSubtitleOverlay()) {
      setStatus("unsupported", SUBTITLE_PIP_UNSUPPORTED_MESSAGE);
      return;
    }

    setStatus("connecting", "Requesting audio capture and connecting realtime sessions.");
    lastAudioInputAt = Date.now();
    noAudioDetected = false;
    elapsedSessionSeconds = 0;
    lastSavedSessionCost = null;
    capture = buildCapture();
    const subtitleOpenPromise = subtitleModeEnabled
      ? subtitleOverlay.open(translatedTranscript)
      : Promise.resolve();
    const captureStartPromise = capture.start({
      inputTranscriptEnabled,
      inputLanguage,
      mode: audioCaptureMode,
      microphoneDeviceId: selectedAudioInputId,
      outputLanguage,
    });
    try {
      await Promise.all([subtitleOpenPromise, captureStartPromise]);
      sessionStartedAt = new Date().toISOString();
      updateElapsedSessionSeconds();
      void refreshAudioInputOptions();
    } catch (error) {
      subtitleOverlay.close();
      captureActive = false;
      capture = null;
      sessionStartedAt = null;
      elapsedSessionSeconds = 0;
      setStatus("error", error instanceof Error ? error.message : String(error));
      void refreshAudioInputOptions();
    }
  }

  async function stopCapture(): Promise<void> {
    const sessionSourceTranscript = sourceTranscript;
    const sessionTranslatedTranscript = translatedTranscript;
    const sessionInputLanguage = inputLanguage;
    const sessionOutputLanguage = outputLanguage;
    const inputTranscriptEnabledForSession = inputTranscriptEnabled;
    const startedAt = sessionStartedAt;
    const endedAt = new Date().toISOString();

    capture?.stop();
    subtitleOverlay.close();
    capture = null;
    sessionStartedAt = null;
    elapsedSessionSeconds = 0;

    try {
      const data = await saveTranscriptSession({
        sourceText: inputTranscriptEnabledForSession ? sessionSourceTranscript : "",
        translatedText: sessionTranslatedTranscript,
        inputLanguage: sessionInputLanguage,
        outputLanguage: sessionOutputLanguage,
        startedAt,
        endedAt,
      });
      if (!data) {
        setStatus("stopped", "Capture stopped. No transcript text was available to save.");
        return;
      }

      lastSavedSessionCost = data?.cost ?? null;
      setStatus(
        "stopped",
        `Capture stopped. Session transcripts saved to ${data.directory || "the save folder"}.`,
      );
    } catch (error) {
      setStatus(
        "error",
        `Capture stopped, but transcript autosave failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function testServerConnection(): Promise<void> {
    if (!languagePairValid) {
      setStatus("error", languagePairErrorMessage());
      return;
    }

    testRunning = true;
    setStatus("checking", "Checking realtime translation endpoint.");
    try {
      const endpointChecks = [
        fetch(
          buildRealtimeLanguageUrl(
            "/api/realtime/translation-token",
            "output_language",
            outputLanguage,
          ),
        ),
      ];
      if (inputTranscriptEnabled) {
        endpointChecks.unshift(
          fetch(
            buildRealtimeLanguageUrl(
              "/api/realtime/token",
              "input_language",
              inputLanguage,
              { output_language: outputLanguage },
            ),
          ),
        );
      }

      const responses = await Promise.all(endpointChecks);
      const failedResponse = responses.find((response) => !response.ok);

      if (!failedResponse) {
        setStatus(
          "ready",
          inputTranscriptEnabled
            ? "Realtime transcription and translation test passed."
            : "Realtime translation test passed.",
        );
      } else {
        setStatus("error", `Realtime transcription/translation test failed: ${await failedResponse.text()}`);
      }
    } catch (error) {
      setStatus(
        "error",
        `Realtime transcription/translation test failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      testRunning = false;
    }
  }

  function openFeedbackDialog(): void {
    feedbackError = "";
    feedbackDialog?.showModal();
  }

  function closeFeedbackDialog(): void {
    if (feedbackSubmitting) return;
    feedbackDialog?.close();
  }

  async function submitFeedback(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!feedbackText.trim()) {
      feedbackError = "Describe the bug or feedback before sending.";
      return;
    }

    feedbackSubmitting = true;
    feedbackError = "";
    try {
      await sendFeedbackReport({
        feedback: feedbackText,
        sourceTranscript,
        translatedTranscript,
        inputLanguage,
        inputLanguageLabel,
        outputLanguage,
        outputLanguageLabel,
        sessionStartedAt,
        captureActive,
        audioCaptureMode,
        inputTranscriptEnabled,
        selectedAudioInputId,
        appConfig: config,
      });
      feedbackText = "";
      feedbackDialog?.close();
      setStatusMessage("Feedback report sent.");
    } catch (error) {
      feedbackError = error instanceof Error ? error.message : String(error);
    } finally {
      feedbackSubmitting = false;
    }
  }

</script>

<main class="app">
  <header class="topbar">
    <div class="brand">
      <h1>FireTong</h1>
      <p class="pronunciation">Pronounced "Fire Tongue"</p>
      <p>Live sermon translation across Indonesian, English, and German.</p>
    </div>
    <div class="topbar-actions" aria-label="Project actions">
      <button
        type="button"
        class="secondary topbar-action"
        onclick={testServerConnection}
        disabled={testRunning || captureActive || capturePending || !languagePairValid}
      >
        {testRunning ? "Checking..." : "Check connection"}
      </button>
      <button type="button" class="secondary topbar-action" onclick={openFeedbackDialog}>
        Report bug
      </button>
      <a class="button-link" href={supportUrl} target="_blank" rel="noreferrer">
        Support FireTong
      </a>
    </div>
  </header>

  <section class="live-console" aria-label="Live translation setup">
    <LiveTranslationControls
      bind:audioCaptureMode
      bind:inputTranscriptEnabled
      bind:inputLanguage
      bind:outputLanguage
      bind:selectedAudioInputId
      bind:subtitleModeEnabled
      {audioInputOptions}
      {browserSupported}
      {captureActive}
      {capturePending}
      {desktopCaptureSupported}
      {languagePairValid}
      {meterLevel}
      {microphoneCaptureSupported}
      {realtimeLanguageOptions}
      {refreshAudioInputOptions}
      {startCapture}
      {stopCapture}
    />

    <LiveStatus
      status={visibleStatus}
      title={visibleStatusTitle}
      message={visibleStatusMessage}
      {captureActive}
      sourceLanguageLabel={inputLanguageLabel}
      translatedLanguageLabel={outputLanguageLabel}
    />
  </section>

  <TranscriptPanels
    bind:sourceTextarea
    bind:sourceTranscript
    sourceTranscriptEnabled={inputTranscriptEnabled}
    sourceLanguageLabel={inputLanguageLabel}
    bind:translatedTextarea
    bind:translatedTranscript
    translatedLanguageLabel={outputLanguageLabel}
  />

  <dialog class="feedback-dialog" aria-labelledby="feedback-title" bind:this={feedbackDialog}>
    <form class="feedback-form" method="dialog" onsubmit={submitFeedback}>
      <div class="feedback-header">
        <div>
          <p class="panel-kicker">Report bug</p>
          <h2 id="feedback-title">Send feedback</h2>
        </div>
        <button type="button" class="secondary icon-close" onclick={closeFeedbackDialog}>
          Close
        </button>
      </div>
      <label class="feedback-field">
        <span>What happened?</span>
        <textarea
          bind:value={feedbackText}
          rows="6"
          placeholder="Describe the feedback or problem."
          disabled={feedbackSubmitting}
        ></textarea>
      </label>
      <p class="feedback-note">
        This sends the current transcripts, language settings, browser details, and session
        metadata with your message.
      </p>
      {#if feedbackError}
        <p class="feedback-error" role="alert">{feedbackError}</p>
      {/if}
      <div class="feedback-actions">
        <button type="button" class="secondary" onclick={closeFeedbackDialog} disabled={feedbackSubmitting}>
          Cancel
        </button>
        <button type="submit" class="primary-action" disabled={feedbackSubmitting}>
          {feedbackSubmitting ? "Sending..." : "Send report"}
        </button>
      </div>
    </form>
  </dialog>

  <footer class="footer">
    <section class="session-cost" aria-label="Session cost estimate" aria-live="polite">
      <div>
        <p class="session-cost-label">{sessionCostTitle}</p>
        <p class="session-cost-note">{sessionCostNote}</p>
      </div>
      <strong>{sessionCostValue}</strong>
    </section>
    <div class="footer-copy">
      <p>
        Support helps pay for realtime translation credit, like adding fuel for the
        next sermon.
      </p>
      <p>
        Audio is streamed to an AI provider. Translated output is saved
        automatically; source-language transcripts are saved only when enabled.
      </p>
    </div>
    <nav aria-label="Footer links">
      <a href={supportUrl} target="_blank" rel="noreferrer">Fuel FireTong</a>
      <a href={`mailto:${feedbackEmail}`}>{feedbackEmail}</a>
      <a href={linkedInUrl} target="_blank" rel="noreferrer">Stephen Kurniawan on LinkedIn</a>
    </nav>
  </footer>
</main>
