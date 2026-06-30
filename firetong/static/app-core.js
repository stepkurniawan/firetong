export const DEFAULT_CONFIG = {
  openai_base_url: "https://api.openai.com/v1",
  translation_model: "gpt-4o-mini",
  live_translation_debounce_ms: 2000,
  live_translation_force_words: 20,
};

export function missingBrowserFeatures(browserWindow, browserNavigator) {
  const missing = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.RTCPeerConnection) missing.push("realtime audio streaming");
  if (!browserWindow.AudioContext) missing.push("audio analysis");

  return missing;
}
