export type AppConfig = {
  openai_base_url: string;
  realtime_input_language: RealtimeLanguage;
  realtime_translation_model: string;
  realtime_translation_language: RealtimeLanguage;
};

export const REALTIME_LANGUAGE_OPTIONS = [
  { value: "id", label: "Indonesian" },
  { value: "en", label: "English" },
  { value: "de", label: "German" },
] as const;

export type RealtimeLanguage = (typeof REALTIME_LANGUAGE_OPTIONS)[number]["value"];
export type RealtimeLanguageParam = "input_language" | "output_language";

export const DEFAULT_CONFIG: AppConfig = {
  openai_base_url: "https://api.openai.com/v1",
  realtime_input_language: "id",
  realtime_translation_model: "gpt-realtime-translate",
  realtime_translation_language: "en",
};

export function buildRealtimeLanguageUrl(
  path: string,
  languageParam: RealtimeLanguageParam,
  language: RealtimeLanguage,
): string {
  const params = new URLSearchParams({ [languageParam]: language });
  return `${path}?${params.toString()}`;
}

export function realtimeLanguageLabel(language: RealtimeLanguage): string {
  return REALTIME_LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language;
}

export function hasDistinctRealtimeLanguages(
  inputLanguage: RealtimeLanguage,
  outputLanguage: RealtimeLanguage,
): boolean {
  return inputLanguage !== outputLanguage;
}

export function firstDifferentRealtimeLanguage(language: RealtimeLanguage): RealtimeLanguage {
  return REALTIME_LANGUAGE_OPTIONS.find((option) => option.value !== language)?.value ?? language;
}

type BrowserFeatureWindow = Window & {
  RTCPeerConnection?: unknown;
  AudioContext?: unknown;
};

export function missingBrowserFeatures(
  browserWindow: BrowserFeatureWindow,
  browserNavigator: Navigator,
): string[] {
  const missing: string[] = [];
  const hasScreenAudioCapture = Boolean(browserNavigator.mediaDevices?.getDisplayMedia);
  const hasMicrophoneAudioCapture = Boolean(browserNavigator.mediaDevices?.getUserMedia);

  if (!hasScreenAudioCapture && !hasMicrophoneAudioCapture) missing.push("audio capture");
  if (!browserWindow.RTCPeerConnection) missing.push("realtime audio streaming");
  if (!browserWindow.AudioContext) missing.push("audio analysis");

  return missing;
}
