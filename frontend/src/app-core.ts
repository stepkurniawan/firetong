export type AppConfig = {
  openai_base_url: string;
  realtime_translation_model: string;
  realtime_translation_language: string;
};

export const DEFAULT_CONFIG: AppConfig = {
  openai_base_url: "https://api.openai.com/v1",
  realtime_translation_model: "gpt-realtime-translate",
  realtime_translation_language: "en",
};

type BrowserFeatureWindow = Window & {
  RTCPeerConnection?: unknown;
  AudioContext?: unknown;
};

export function missingBrowserFeatures(
  browserWindow: BrowserFeatureWindow,
  browserNavigator: Navigator,
): string[] {
  const missing: string[] = [];

  if (!browserNavigator.mediaDevices?.getDisplayMedia) missing.push("screen audio capture");
  if (!browserWindow.RTCPeerConnection) missing.push("realtime audio streaming");
  if (!browserWindow.AudioContext) missing.push("audio analysis");

  return missing;
}
