<script lang="ts">
  export let sourceTextarea: HTMLDivElement | null = null;
  export let sourceTranscript = "";
  export let sourceTranscriptEnabled = true;
  export let sourceLanguageLabel = "Indonesian";
  export let translatedTextarea: HTMLDivElement | null = null;
  export let translatedTranscript = "";
  export let translatedLanguageLabel = "English";
</script>

<section
  class:panels-output-only={!sourceTranscriptEnabled}
  class="panels"
  aria-label={sourceTranscriptEnabled ? "Transcript and translation" : "Translation"}
>
  {#if sourceTranscriptEnabled}
    <article class="panel">
      <div class="panel-title">
        <div>
          <p class="panel-kicker">Source transcript</p>
          <h2>{sourceLanguageLabel}</h2>
        </div>
      </div>
      <div
        class="transcript-surface"
        bind:this={sourceTextarea}
        data-readonly="true"
        role="log"
        aria-label={`${sourceLanguageLabel} source transcript`}
        aria-live="polite"
      >
        {#if sourceTranscript.trim()}
          <p>{sourceTranscript}</p>
        {:else}
          <p class="transcript-placeholder">
            Live {sourceLanguageLabel.toLowerCase()} source text will appear here.
          </p>
        {/if}
      </div>
    </article>
  {/if}

  <article class="panel">
    <div class="panel-title">
      <div>
        <p class="panel-kicker">Translation</p>
        <h2>{translatedLanguageLabel}</h2>
      </div>
    </div>
    <div
      class="transcript-surface transcript-surface-primary"
      bind:this={translatedTextarea}
      data-readonly="true"
      role="log"
      aria-label={`${translatedLanguageLabel} translation`}
      aria-live="polite"
    >
      {#if translatedTranscript.trim()}
        <p>{translatedTranscript}</p>
      {:else}
        <p class="transcript-placeholder">
          {translatedLanguageLabel} translation will appear here.
        </p>
      {/if}
    </div>
  </article>
</section>
