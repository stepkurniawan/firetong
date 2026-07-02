<script lang="ts">
  import { onMount, tick } from "svelte";
  import { DEFAULT_CONFIG, missingBrowserFeatures, type AppConfig } from "./app-core";
  import { RealtimeCapture } from "./realtime";

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
    const missing = missingBrowserFeatures(window, navigator);
    if (missing.length === 0) {
      browserSupported = true;
      return true;
    }

    browserSupported = false;
    setLog(`This browser is missing: ${missing.join(", ")}.`);
    return false;
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

    capture = buildCapture();
    try {
      await capture.start();
    } catch (error) {
      captureActive = false;
      setLog(error instanceof Error ? error.message : String(error));
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

  <section class="controls" aria-label="Live translation controls">
    <label class="api-key-field">
      <span>OpenAI API key override</span>
      <input
        type="password"
        bind:value={openaiApiKeyOverride}
        placeholder="Use server key"
        autocomplete="off"
        disabled={captureActive}
      />
    </label>
    <button type="button" onclick={saveOpenAiApiKeyOverride} disabled={captureActive}>Save key</button>
    <button
      type="button"
      class="secondary"
      onclick={clearOpenAiApiKeyOverride}
      disabled={captureActive || !openaiApiKeyOverride}
    >
      Clear key
    </button>
    <button type="button" onclick={testServerConnection} disabled={testRunning}>
      {testRunning ? "Testing..." : "Test OpenAI"}
    </button>
    <button type="button" onclick={startCapture} disabled={captureActive || !browserSupported}>
      Start live translation
    </button>
    <button type="button" onclick={stopCapture} disabled={!captureActive}>Stop</button>
    <button type="button" onclick={clearTranscripts}>Clear</button>
    <div class="meter" aria-label="Audio level">
      <span style={`width: ${meterLevel}%`}></span>
    </div>
    {#if apiKeyMessage}
      <span class="api-key-message">{apiKeyMessage}</span>
    {/if}
  </section>

  <section class="panels" aria-label="Transcript and translation">
    <article class="panel">
      <div class="panel-title">
        <h2>Indonesian source</h2>
      </div>
      <textarea
        bind:this={sourceTextarea}
        readonly
        bind:value={sourceTranscript}
        placeholder="Live Indonesian source appears here."
      ></textarea>
    </article>

    <article class="panel">
      <div class="panel-title">
        <h2>English</h2>
      </div>
      <textarea
        bind:this={translatedTextarea}
        readonly
        bind:value={translatedTranscript}
        placeholder="English translation appears here."
      ></textarea>
    </article>
  </section>

  <p class="log">{logMessage}</p>
</main>
