import type { RealtimeLanguage } from "./app-core";

export type TranscriptSessionCost = {
  currency: string;
  estimated_total_usd: number | null;
  sessions: Array<{
    name: string;
    model: string;
    pricing_basis: string;
    duration_seconds: number | null;
    rate_usd_per_minute: number | null;
    estimated_cost_usd: number | null;
  }>;
};

export type TranscriptSessionSaveResponse = {
  directory?: string;
  cost?: TranscriptSessionCost;
};

export type TranscriptSessionSavePayload = {
  sourceText: string;
  translatedText: string;
  inputLanguage: RealtimeLanguage;
  outputLanguage: RealtimeLanguage;
  startedAt: string | null;
  endedAt: string;
};

export function hasSavedTranscriptContent(sourceText: string, translatedText: string): boolean {
  return Boolean(sourceText.trim() || translatedText.trim());
}

export async function saveTranscriptSession(
  payload: TranscriptSessionSavePayload,
): Promise<TranscriptSessionSaveResponse | null> {
  if (!hasSavedTranscriptContent(payload.sourceText, payload.translatedText)) return null;

  const response = await fetch("/api/transcript-sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_text: payload.sourceText,
      translated_text: payload.translatedText,
      input_language: payload.inputLanguage,
      output_language: payload.outputLanguage,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
    }),
  });

  if (!response.ok) throw new Error(await response.text());

  return (await response.json()) as TranscriptSessionSaveResponse;
}
