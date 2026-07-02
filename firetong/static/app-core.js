export const DEFAULT_CONFIG = {
  openai_base_url: "https://api.openai.com/v1",
  realtime_translation_model: "gpt-realtime-translate",
  realtime_translation_language: "en",
};

export function missingBrowserFeatures(browserWindow, browserNavigator) {
  const missing = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.RTCPeerConnection) missing.push("realtime audio streaming");
  if (!browserWindow.AudioContext) missing.push("audio analysis");

  return missing;
}
