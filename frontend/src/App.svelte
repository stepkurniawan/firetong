<script lang="ts">
  import { onMount, tick } from "svelte";
  import { listAudioInputOptions, type AudioInputOption } from "./audio-devices";
  import { DEFAULT_CONFIG, missingBrowserFeatures, type AppConfig } from "./app-core";
  import LiveTranslationControls from "./LiveTranslationControls.svelte";
  import { RealtimeCapture, type AudioCaptureMode } from "./realtime";
  import TranscriptPanels from "./TranscriptPanels.svelte";

  const OPENAI_API_KEY_OVERRIDE_STORAGE_KEY = "firetong.openaiApiKeyOverride";

  let config: AppConfig = { ...DEFAULT_CONFIG };
  let capture: RealtimeCapture | null = null;

  let apiStatus = "Loading settings...";
  let logMessage = "";
  let browserSupported = true;
  let captureActive = false;
  let testRunning = false;
  let openaiApiKeyOverride = "";
  let apiKeyMessage = "";
  let audioCaptureMode: AudioCaptureMode = "desktop";
  let selectedAudioInputId = "default";
  let audioInputOptions: AudioInputOption[] = [];
  let desktopCaptureSupported = true;
  let microphoneCaptureSupported = true;

  let meterLevel = 0;

  let sourceTranscript = "";
  let translatedTranscript = "";
  let sourceTextarea: HTMLTextAreaElement | null = null;
  let translatedTextarea: HTMLTextAreaElement | null = null;

  onMount(() => {
    openaiApiKeyOverride = localStorage.getItem(OPENAI_API_KEY_OVERRIDE_STORAGE_KEY) || "";
    if (openaiApiKeyOverride) {
      apiKeyMessage = "Using browser OpenAI key override.";
    }

    void readConfig();
    void refreshAudioInputOptions();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        setLog("Service worker registration failed.");
      });
    }
  });

  function setLog(message: string): void {
    logMessage = message;
  }

  function checkBrowserSupport(): boolean {
    updateCaptureSupport();
    const missing = missingBrowserFeatures(window, navigator);
    if (missing.length === 0) {
      browserSupported = true;
      return true;
    }

    browserSupported = false;
    setLog(`This browser is missing: ${missing.join(", ")}.`);
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
      }
    } catch {
      setLog("Using built-in browser defaults.");
    }

    apiStatus = `OpenAI API ready (${config.realtime_translation_model})`;
    checkBrowserSupport();
  }

  async function scrollTranscriptAreas(): Promise<void> {
    await tick();
    if (sourceTextarea) sourceTextarea.scrollTop = sourceTextarea.scrollHeight;
    if (translatedTextarea) translatedTextarea.scrollTop = translatedTextarea.scrollHeight;
  }

  function resetRealtimeState(): void {
    sourceTranscript = sourceTranscript.trim();
    translatedTranscript = translatedTranscript.trim();
    void scrollTranscriptAreas();
  }

  function openaiApiKeyHeaders(): HeadersInit {
    const apiKey = openaiApiKeyOverride.trim();
    return apiKey ? { "X-OpenAI-API-Key": apiKey } : {};
  }

  function saveOpenAiApiKeyOverride(): void {
    const apiKey = openaiApiKeyOverride.trim();
    openaiApiKeyOverride = apiKey;

    if (apiKey) {
      localStorage.setItem(OPENAI_API_KEY_OVERRIDE_STORAGE_KEY, apiKey);
      apiKeyMessage = "Using browser OpenAI key override.";
    } else {
      localStorage.removeItem(OPENAI_API_KEY_OVERRIDE_STORAGE_KEY);
      apiKeyMessage = "Using server OpenAI key.";
    }
  }

  function clearOpenAiApiKeyOverride(): void {
    openaiApiKeyOverride = "";
    localStorage.removeItem(OPENAI_API_KEY_OVERRIDE_STORAGE_KEY);
    apiKeyMessage = "Using server OpenAI key.";
  }

  function markSourceProgress(delta: string): void {
    if (!delta) return;

    sourceTranscript = `${sourceTranscript}${delta}`;
    void scrollTranscriptAreas();
  }

  function appendTranslatedText(delta: string): void {
    if (!delta) return;

    translatedTranscript = `${translatedTranscript}${delta}`;
    void scrollTranscriptAreas();
  }

  function buildCapture(): RealtimeCapture {
    return new RealtimeCapture(
      config,
      {
        onCapturingChange: (isCapturing) => {
          captureActive = isCapturing;
        },
        onLog: setLog,
        onMeter: (levelPercent) => {
          meterLevel = levelPercent;
        },
        onResetTranscripts: resetRealtimeState,
        onSourceComplete: () => {},
        onSourceDelta: markSourceProgress,
        onState: () => {},
        onTranslationDelta: appendTranslatedText,
      },
      openaiApiKeyOverride,
    );
  }

  async function startCapture(): Promise<void> {
    if (!checkBrowserSupport()) return;
    if (!selectedCaptureSourceSupported()) {
      const sourceLabel = audioCaptureMode === "desktop" ? "Desktop/tab" : "Microphone";
      setLog(`${sourceLabel} audio capture is unavailable.`);
      return;
    }

    capture = buildCapture();
    try {
      await capture.start({
        mode: audioCaptureMode,
        microphoneDeviceId: selectedAudioInputId,
      });
      void refreshAudioInputOptions();
    } catch (error) {
      captureActive = false;
      setLog(error instanceof Error ? error.message : String(error));
      void refreshAudioInputOptions();
    }
  }

  function stopCapture(): void {
    capture?.stop();
    capture = null;
  }

  async function testServerConnection(): Promise<void> {
    testRunning = true;
    try {
      const [transcriptionResponse, translationResponse] = await Promise.all([
        fetch("/api/realtime/token", { headers: openaiApiKeyHeaders() }),
        fetch("/api/realtime/translation-token", { headers: openaiApiKeyHeaders() }),
      ]);

      if (transcriptionResponse.ok && translationResponse.ok) {
        setLog("Realtime transcription and translation test passed.");
      } else {
        const failedResponse = transcriptionResponse.ok ? translationResponse : transcriptionResponse;
        setLog(`Realtime transcription/translation test failed: ${await failedResponse.text()}`);
      }
    } catch (error) {
      setLog(
        `Realtime transcription/translation test failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      testRunning = false;
    }
  }

  function clearTranscripts(): void {
    sourceTranscript = "";
    translatedTranscript = "";
  }

</script>

<main class="app">
  <header class="topbar">
    <div>
      <h1>FireTong</h1>
      <p>Indonesian sermon audio to English translation</p>
    </div>
    <div class="status">{apiStatus}</div>
  </header>

  <LiveTranslationControls
    bind:audioCaptureMode
    bind:openaiApiKeyOverride
    bind:selectedAudioInputId
    {apiKeyMessage}
    {audioInputOptions}
    {browserSupported}
    {captureActive}
    {clearOpenAiApiKeyOverride}
    {clearTranscripts}
    {desktopCaptureSupported}
    {meterLevel}
    {microphoneCaptureSupported}
    {refreshAudioInputOptions}
    {saveOpenAiApiKeyOverride}
    {startCapture}
    {stopCapture}
    {testRunning}
    {testServerConnection}
  />

  <TranscriptPanels
    bind:sourceTextarea
    bind:sourceTranscript
    bind:translatedTextarea
    bind:translatedTranscript
  />

  <p class="log">{logMessage}</p>
</main>
