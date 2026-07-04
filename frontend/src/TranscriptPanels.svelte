<script lang="ts">
  export let sourceTextarea: HTMLTextAreaElement | null = null;
  export let sourceTranscript = "";
  export let sourceLanguageLabel = "Indonesian";
  export let translatedTextarea: HTMLTextAreaElement | null = null;
  export let translatedTranscript = "";
  export let translatedLanguageLabel = "English";
</script>

<section class="panels" aria-label="Transcript and translation">
  <article class="panel">
    <div class="panel-title">
      <h2>{sourceLanguageLabel} source</h2>
    </div>
    <textarea
      bind:this={sourceTextarea}
      readonly
      bind:value={sourceTranscript}
      placeholder={`Live ${sourceLanguageLabel.toLowerCase()} source appears here.`}
    ></textarea>
  </article>

  <article class="panel">
    <div class="panel-title">
      <h2>{translatedLanguageLabel}</h2>
    </div>
    <textarea
      bind:this={translatedTextarea}
      readonly
      bind:value={translatedTranscript}
      placeholder={`${translatedLanguageLabel} translation appears here.`}
    ></textarea>
  </article>
</section>
