export const DEFAULT_CONFIG = {
  openai_base_url: "https://api.openai.com/v1",
  translation_model: "gpt-4o-mini",
};

export function missingBrowserFeatures(browserWindow, browserNavigator) {
  const missing = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.RTCPeerConnection) missing.push("realtime audio streaming");
  if (!browserWindow.AudioContext) missing.push("audio analysis");

  return missing;
}
