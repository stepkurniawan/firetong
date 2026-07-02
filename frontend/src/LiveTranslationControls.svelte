<script lang="ts">
  import type { AudioInputOption } from "./audio-devices";
  import type { AudioCaptureMode } from "./realtime";

  export let audioCaptureMode: AudioCaptureMode = "desktop";
  export let audioInputOptions: AudioInputOption[] = [];
  export let browserSupported = true;
  export let captureActive = false;
  export let desktopCaptureSupported = true;
  export let microphoneCaptureSupported = true;
  export let meterLevel = 0;
  export let selectedAudioInputId = "default";

  export let refreshAudioInputOptions: () => void | Promise<void>;
  export let startCapture: () => void | Promise<void>;
  export let stopCapture: () => void;

  $: selectableAudioInputOptions = audioInputOptions.filter(
    (device) => device.deviceId !== "default",
  );

  function toggleCapture(): void {
    if (captureActive) {
      stopCapture();
      return;
    }

    void startCapture();
  }

  $: captureButtonLabel = captureActive
    ? "Stop translation"
    : "Start live translation";
</script>

<section class="controls" aria-label="Live translation controls">
  <div class="control-group">
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
    {/if}
  </div>
  <div class="action-group" aria-label="Capture actions">
    {#if audioCaptureMode === "microphone"}
      <button
        type="button"
        class="secondary"
        onclick={refreshAudioInputOptions}
        disabled={captureActive}
      >
        Refresh inputs
      </button>
    {/if}
    <button
      type="button"
      class="primary-action"
      onclick={toggleCapture}
      disabled={!captureActive && !browserSupported}
    >
      {captureButtonLabel}
    </button>
  </div>
  <div class="meter" aria-label="Audio level">
    <span style={`width: ${meterLevel}%`}></span>
  </div>
</section>
