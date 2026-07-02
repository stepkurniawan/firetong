<script lang="ts">
  export let sourceTextarea: HTMLTextAreaElement | null = null;
  export let sourceTranscript = "";
  export let translatedTextarea: HTMLTextAreaElement | null = null;
  export let translatedTranscript = "";
</script>

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
