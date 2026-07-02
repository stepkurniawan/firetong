<script lang="ts">
  import type { AudioInputOption } from "./audio-devices";
  import type { AudioCaptureMode } from "./realtime";

  export let apiKeyMessage = "";
  export let audioCaptureMode: AudioCaptureMode = "desktop";
  export let audioInputOptions: AudioInputOption[] = [];
  export let browserSupported = true;
  export let captureActive = false;
  export let desktopCaptureSupported = true;
  export let microphoneCaptureSupported = true;
  export let meterLevel = 0;
  export let openaiApiKeyOverride = "";
  export let selectedAudioInputId = "default";
  export let testRunning = false;

  export let clearOpenAiApiKeyOverride: () => void;
  export let clearTranscripts: () => void;
  export let refreshAudioInputOptions: () => void | Promise<void>;
  export let saveOpenAiApiKeyOverride: () => void;
  export let startCapture: () => void | Promise<void>;
  export let stopCapture: () => void;
  export let testServerConnection: () => void | Promise<void>;

  $: selectableAudioInputOptions = audioInputOptions.filter(
    (device) => device.deviceId !== "default",
  );
</script>

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
  <label class="control-field source-field">
    <span>Audio source</span>
    <select bind:value={audioCaptureMode} disabled={captureActive}>
      <option value="desktop" disabled={!desktopCaptureSupported}>Desktop or tab audio</option>
      <option value="microphone" disabled={!microphoneCaptureSupported}>Microphone input</option>
    </select>
  </label>
  {#if audioCaptureMode === "microphone"}
    <label class="control-field input-field">
      <span>Microphone</span>
      <select bind:value={selectedAudioInputId} disabled={captureActive}>
        <option value="default">System default microphone</option>
        {#each selectableAudioInputOptions as device}
          <option value={device.deviceId}>{device.label}</option>
        {/each}
      </select>
    </label>
    <button
      type="button"
      class="secondary"
      onclick={refreshAudioInputOptions}
      disabled={captureActive}
    >
      Refresh inputs
    </button>
  {/if}
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
