export const DEFAULT_CONFIG = {
  openai_base_url: "https://api.openai.com/v1",
  translation_model: "gpt-4o-mini",
  transcription_model: "Xenova/whisper-tiny",
  chunk_seconds: 5,
};

export const SERMON_TRANSLATOR_PROMPT = [
  "You are a professional Christian sermon interpreter.",
  "Translate Indonesian sermon text to English.",
  "Preserve theological terms such as Tuhan (Lord), Roh Kudus (Holy Spirit), Anugerah (Grace), Injil (Gospel), and Firman (the Word).",
  "Be faithful, natural, and concise.",
].join(" ");

export function createPauseDetector({
  silenceGapMs = 1000,
  minChunkMs = 1000,
  voiceThreshold = 0.08,
  maxChunkMs,
  now = () => Date.now(),
  onFlush,
}) {
  let heardSpeech = false;
  let chunkStartedAt = now();
  let lastVoiceAt = chunkStartedAt;

  return {
    sample(level) {
      const currentTime = now();

      if (level >= voiceThreshold) {
        heardSpeech = true;
        lastVoiceAt = currentTime;
      }

      if (!heardSpeech) return false;

      const chunkAge = currentTime - chunkStartedAt;
      const silenceAge = currentTime - lastVoiceAt;
      const shouldFlush =
        (silenceAge >= silenceGapMs && chunkAge >= minChunkMs) ||
        (maxChunkMs !== undefined && chunkAge >= maxChunkMs);

      if (!shouldFlush) return false;

      heardSpeech = false;
      chunkStartedAt = currentTime;
      onFlush();
      return true;
    },

    reset() {
      heardSpeech = false;
      chunkStartedAt = now();
      lastVoiceAt = chunkStartedAt;
    },
  };
}

export function buildTranslationRequest({ config, apiKey, text }) {
  return {
    url: `${config.openai_base_url}/chat/completions`,
    options: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.translation_model,
        messages: [
          { role: "system", content: SERMON_TRANSLATOR_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.2,
      }),
    },
  };
}

export function missingBrowserFeatures(browserWindow, browserNavigator) {
  const missing = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.MediaRecorder) missing.push("audio recording");
  if (!browserWindow.AudioContext) missing.push("audio analysis");
  if (!browserWindow.OfflineAudioContext) missing.push("audio resampling");

  return missing;
}
