export const DEFAULT_CONFIG = {
  openai_base_url: "https://api.openai.com/v1",
  translation_model: "gpt-4o-mini",
  transcription_model: "whisper-1",
  chunk_seconds: 5,
};

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

export function missingBrowserFeatures(browserWindow, browserNavigator) {
  const missing = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.MediaRecorder) missing.push("audio recording");
  if (!browserWindow.AudioContext) missing.push("audio analysis");
  if (!browserWindow.OfflineAudioContext) missing.push("audio resampling");

  return missing;
}
