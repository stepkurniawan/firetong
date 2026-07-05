import type { AppConfig, RealtimeLanguage } from "./app-core";
import type { AudioCaptureMode } from "./realtime";

type NetworkInformation = {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
  type?: string;
};

type FeedbackReportPayload = {
  feedback: string;
  sourceTranscript: string;
  translatedTranscript: string;
  inputLanguage: RealtimeLanguage;
  inputLanguageLabel: string;
  outputLanguage: RealtimeLanguage;
  outputLanguageLabel: string;
  sessionStartedAt: string | null;
  captureActive: boolean;
  audioCaptureMode: AudioCaptureMode;
  inputTranscriptEnabled: boolean;
  selectedAudioInputId: string;
  appConfig: AppConfig;
};

export async function sendFeedbackReport(payload: FeedbackReportPayload): Promise<void> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      feedback: payload.feedback,
      source_transcript: payload.sourceTranscript,
      translated_transcript: payload.translatedTranscript,
      input_language: payload.inputLanguage,
      input_language_label: payload.inputLanguageLabel,
      output_language: payload.outputLanguage,
      output_language_label: payload.outputLanguageLabel,
      metadata: collectFeedbackMetadata(payload),
    }),
  });

  if (!response.ok) throw new Error(await responseErrorMessage(response));
}

function collectFeedbackMetadata(payload: FeedbackReportPayload): Record<string, unknown> {
  const connection = navigatorWithConnection().connection;

  return {
    reported_at: new Date().toISOString(),
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    online: navigator.onLine,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio,
    },
    session: {
      started_at: payload.sessionStartedAt,
      capture_active: payload.captureActive,
      audio_capture_mode: payload.audioCaptureMode,
      input_transcript_enabled: payload.inputTranscriptEnabled,
      selected_audio_input_id: payload.selectedAudioInputId,
    },
    config: {
      openai_base_url: payload.appConfig.openai_base_url,
      transcription_model: payload.appConfig.transcription_model,
      realtime_translation_model: payload.appConfig.realtime_translation_model,
      realtime_duration_rates_usd_per_minute:
        payload.appConfig.realtime_duration_rates_usd_per_minute,
    },
    network: connection
      ? {
          downlink_mbps: connection.downlink,
          effective_type: connection.effectiveType,
          rtt_ms: connection.rtt,
          save_data: connection.saveData,
          type: connection.type,
        }
      : null,
  };
}

function navigatorWithConnection(): Navigator & { connection?: NetworkInformation } {
  return navigator as Navigator & { connection?: NetworkInformation };
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Fall back to the response text below.
  }

  return response.text();
}
