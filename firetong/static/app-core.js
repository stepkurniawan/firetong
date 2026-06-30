export const DEFAULT_CONFIG = {
  openai_base_url: "https://api.openai.com/v1",
  translation_model: "gpt-5.4-nano",
  realtime_translation_model: "gpt-realtime-translate",
  realtime_translation_language: "en",
  live_translation_debounce_ms: 500,
  live_translation_force_words: 20,
};

export function missingBrowserFeatures(browserWindow, browserNavigator) {
  const missing = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.RTCPeerConnection) missing.push("realtime audio streaming");
  if (!browserWindow.AudioContext) missing.push("audio analysis");

  return missing;
}
