export type RealtimeEvent = {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  error?: {
    message?: string;
  };
};

export type RealtimeEventState = {
  transcriptionItems: Map<string, string>;
  sourceFromTranscription: boolean;
};

type TranscriptionEventCallbacks = {
  onLog(message: string): void;
  onSourceComplete(): void;
  onSourceDelta(delta: string): void;
  onState(state: string): void;
};

type TranslationEventCallbacks = {
  onLog(message: string): void;
  onSourceDelta(delta: string): void;
  onState(state: string): void;
  onTranslationDelta(delta: string): void;
};

export function createRealtimeEventState(): RealtimeEventState {
  return {
    transcriptionItems: new Map<string, string>(),
    sourceFromTranscription: false,
  };
}

export function applyRealtimeTranscriptionEvent(
  event: RealtimeEvent,
  state: RealtimeEventState,
  callbacks: TranscriptionEventCallbacks,
): void {
  if (event.type === "conversation.item.input_audio_transcription.delta") {
    state.sourceFromTranscription = true;
    const itemId = event.item_id || "current";
    const currentText = state.transcriptionItems.get(itemId) || "";
    state.transcriptionItems.set(itemId, `${currentText}${event.delta || ""}`);
    callbacks.onSourceDelta(event.delta || "");
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    state.sourceFromTranscription = true;
    const itemId = event.item_id || "current";
    const currentText = (state.transcriptionItems.get(itemId) || "").trim();
    const transcript = (event.transcript || "").trim();
    if (!currentText && transcript) {
      callbacks.onSourceDelta(transcript);
    }
    state.transcriptionItems.delete(itemId);
    callbacks.onSourceComplete();
  }

  if (event.type === "error") {
    callbacks.onState("Error");
    callbacks.onLog(event.error?.message || "Realtime transcription failed.");
  }
}

export function applyRealtimeTranslationEvent(
  event: RealtimeEvent,
  state: RealtimeEventState,
  callbacks: TranslationEventCallbacks,
): void {
  if (event.type === "session.input_transcript.delta" && !state.sourceFromTranscription) {
    callbacks.onSourceDelta(event.delta || "");
  }

  if (event.type === "session.output_transcript.delta") {
    callbacks.onTranslationDelta(event.delta || "");
  }

  if (event.type === "session.closed") {
    callbacks.onState("Stopped");
  }

  if (event.type === "error") {
    callbacks.onState("Error");
    callbacks.onLog(event.error?.message || "Realtime translation failed.");
  }
}
