<script lang="ts">
  import { onMount, tick } from "svelte";
  import { listAudioInputOptions, type AudioInputOption } from "./audio-devices";
  import { DEFAULT_CONFIG, missingBrowserFeatures, type AppConfig } from "./app-core";
  import LiveTranslationControls from "./LiveTranslationControls.svelte";
  import { RealtimeCapture, type AudioCaptureMode } from "./realtime";
  import TranscriptPanels from "./TranscriptPanels.svelte";

  let config: AppConfig = { ...DEFAULT_CONFIG };
  let capture: RealtimeCapture | null = null;

  let logMessage = "";
  let browserSupported = true;
  let captureActive = false;
  let testRunning = false;
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

  const supportUrl = "https://paypal.me/stepkurniawan";
  const feedbackEmail = "stepkurniawan.learn@gmail.com";
  const linkedInUrl = "https://www.linkedin.com/in/stepkurniawan/";

  onMount(() => {
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
        fetch("/api/realtime/token"),
        fetch("/api/realtime/translation-token"),
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

</script>

<main class="app">
  <header class="topbar">
    <div>
      <h1>FireTong</h1>
      <p>Pronounced "Fire Tongue"</p>
    </div>
    <a class="support-action" href={supportUrl} target="_blank" rel="noreferrer">
      Fuel FireTong
    </a>
    <button
      type="button"
      class="secondary topbar-action"
      onclick={testServerConnection}
      disabled={testRunning}
    >
      {testRunning ? "Checking..." : "Check connection"}
    </button>
  </header>

  <section class="intro" aria-labelledby="intro-title">
    <div class="intro-copy">
      <p class="eyebrow">Live sermon translation</p>
      <h2 id="intro-title">Follow Indonesian sermons in English, as they happen.</h2>
      <p>
        FireTong helps English-speaking listeners, guests, missionaries, bilingual
        families, and church communities follow Indonesian preaching in real time.
        Choose a browser tab, desktop audio, or microphone, then read the Indonesian
        source and English translation side by side.
      </p>
      <p class="author-line">
        Created by Stephen Kurniawan.
      </p>
    </div>
    <div class="intro-actions" aria-label="Project actions">
      <a class="button-link" href={`mailto:${feedbackEmail}`}>Send feedback</a>
    </div>
  </section>

  <section class="guide" aria-label="How FireTong works">
    <div>
      <span>1</span>
      <p>Choose desktop, tab, or microphone audio.</p>
    </div>
    <div>
      <span>2</span>
      <p>Start live translation during the sermon.</p>
    </div>
    <div>
      <span>3</span>
      <p>Read Indonesian and English text together.</p>
    </div>
  </section>

  <section class="notice" aria-label="Privacy and training notice">
    <strong>Before you start:</strong>
    Audio is streamed to OpenAI Realtime for transcription and translation.
    Transcripts may be stored and used to improve FireTong, so only use sermon
    audio or other content you have permission to process.
  </section>

  <LiveTranslationControls
    bind:audioCaptureMode
    bind:selectedAudioInputId
    {audioInputOptions}
    {browserSupported}
    {captureActive}
    {desktopCaptureSupported}
    {meterLevel}
    {microphoneCaptureSupported}
    {refreshAudioInputOptions}
    {startCapture}
    {stopCapture}
  />

  <TranscriptPanels
    bind:sourceTextarea
    bind:sourceTranscript
    bind:translatedTextarea
    bind:translatedTranscript
  />

  <p class="log">{logMessage}</p>

  <footer class="footer">
    <p>
      Support helps pay for realtime translation credit, like adding fuel for the
      next sermon.
    </p>
    <nav aria-label="Footer links">
      <a href={supportUrl} target="_blank" rel="noreferrer">Fuel FireTong</a>
      <a href={`mailto:${feedbackEmail}`}>{feedbackEmail}</a>
      <a href={linkedInUrl} target="_blank" rel="noreferrer">Stephen Kurniawan on LinkedIn</a>
    </nav>
  </footer>
</main>
