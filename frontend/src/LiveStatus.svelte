<script module lang="ts">
  export type LiveStatusKind =
    | "ready"
    | "checking"
    | "connecting"
    | "listening"
    | "no-audio"
    | "reconnecting"
    | "error"
    | "stopped"
    | "unsupported";
</script>

<script lang="ts">
  export let captureActive = false;
  export let message = "";
  export let sourceLanguageLabel = "Indonesian";
  export let status: LiveStatusKind = "ready";
  export let title = "Ready";
  export let translatedLanguageLabel = "English";
</script>

<section class={`status-card status-${status}`} aria-label="Live translation status" aria-live="polite">
  <div class="status-main">
    <span class="status-dot" aria-hidden="true"></span>
    <div>
      <p class="status-title">{title}</p>
      <p class="status-message">{message}</p>
    </div>
  </div>
  <div class="status-meta" aria-label="Current session">
    <span>{sourceLanguageLabel} to {translatedLanguageLabel}</span>
    <span>{captureActive ? "Session active" : "Session idle"}</span>
  </div>
</section>
