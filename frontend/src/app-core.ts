export type RealtimeLanguage = string;

export type RealtimeLanguageOption = {
  value: RealtimeLanguage;
  label: string;
};

export type AppConfig = {
  openai_base_url: string;
  transcription_model: string;
  realtime_input_language: RealtimeLanguage;
  realtime_translation_model: string;
  realtime_translation_language: RealtimeLanguage;
  realtime_language_options: RealtimeLanguageOption[];
  realtime_duration_rates_usd_per_minute: Record<string, number>;
};

const FALLBACK_REALTIME_LANGUAGE_OPTIONS: RealtimeLanguageOption[] = [
  { value: "id", label: "Indonesian" },
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
] as const;
export type RealtimeLanguageParam = "input_language" | "output_language";

export const DEFAULT_CONFIG: AppConfig = {
  openai_base_url: "https://api.openai.com/v1",
  transcription_model: "gpt-realtime-whisper",
  realtime_input_language: "id",
  realtime_translation_model: "gpt-realtime-translate",
  realtime_translation_language: "en",
  realtime_language_options: FALLBACK_REALTIME_LANGUAGE_OPTIONS,
  realtime_duration_rates_usd_per_minute: {
    "gpt-realtime-whisper": 0.017,
    "gpt-realtime-translate": 0.034,
  },
};

export function buildRealtimeLanguageUrl(
  path: string,
  languageParam: RealtimeLanguageParam,
  language: RealtimeLanguage,
  additionalLanguageParams: Partial<Record<RealtimeLanguageParam, RealtimeLanguage>> = {},
): string {
  const params = new URLSearchParams({ [languageParam]: language });
  Object.entries(additionalLanguageParams).forEach(([param, value]) => {
    if (value) params.set(param, value);
  });
  return `${path}?${params.toString()}`;
}

export function realtimeLanguageLabel(
  language: RealtimeLanguage,
  languageOptions: RealtimeLanguageOption[] = DEFAULT_CONFIG.realtime_language_options,
): string {
  return languageOptions.find((option) => option.value === language)?.label ?? language;
}

export function hasDistinctRealtimeLanguages(
  inputLanguage: RealtimeLanguage,
  outputLanguage: RealtimeLanguage,
): boolean {
  return inputLanguage !== outputLanguage;
}

export function firstDifferentRealtimeLanguage(
  language: RealtimeLanguage,
  languageOptions: RealtimeLanguageOption[] = DEFAULT_CONFIG.realtime_language_options,
): RealtimeLanguage {
  return languageOptions.find((option) => option.value !== language)?.value ?? language;
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
