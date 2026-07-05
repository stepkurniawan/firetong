import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRealtimeTranscriptionEvent,
  applyRealtimeTranslationEvent,
  createRealtimeEventState,
} from "./realtime-events.ts";

function createCallbackLog() {
  const log = {
    logs: [] as string[],
    source: [] as string[],
    states: [] as string[],
    translations: [] as string[],
    sourceCompleteCount: 0,
    callbacks: {
      onLog(message: string): void {
        log.logs.push(message);
      },
      onSourceComplete(): void {
        log.sourceCompleteCount += 1;
      },
      onSourceDelta(delta: string): void {
        log.source.push(delta);
      },
      onState(state: string): void {
        log.states.push(state);
      },
      onTranslationDelta(delta: string): void {
        log.translations.push(delta);
      },
    },
  };
  return log;
}

test("transcription deltas are accumulated and completion does not duplicate completed text", () => {
  const state = createRealtimeEventState();
  const log = createCallbackLog();

  applyRealtimeTranscriptionEvent(
    {
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item-1",
      delta: "Selamat ",
    },
    state,
    log.callbacks,
  );
  applyRealtimeTranscriptionEvent(
    {
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "item-1",
      delta: "pagi",
    },
    state,
    log.callbacks,
  );
  applyRealtimeTranscriptionEvent(
    {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-1",
      transcript: "Selamat pagi",
    },
    state,
    log.callbacks,
  );

  assert.deepEqual(log.source, ["Selamat ", "pagi"]);
  assert.equal(log.sourceCompleteCount, 1);
  assert.equal(state.transcriptionItems.has("item-1"), false);
  assert.equal(state.sourceFromTranscription, true);
});

test("transcription completion emits transcript when no deltas arrived", () => {
  const state = createRealtimeEventState();
  const log = createCallbackLog();

  applyRealtimeTranscriptionEvent(
    {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-2",
      transcript: "Tuhan memberkati",
    },
    state,
    log.callbacks,
  );

  assert.deepEqual(log.source, ["Tuhan memberkati"]);
  assert.equal(log.sourceCompleteCount, 1);
});

test("translation source deltas are ignored after transcription owns source text", () => {
  const state = createRealtimeEventState();
  const log = createCallbackLog();

  applyRealtimeTranslationEvent(
    {
      type: "session.input_transcript.delta",
      delta: "fallback source",
    },
    state,
    log.callbacks,
  );
  state.sourceFromTranscription = true;
  applyRealtimeTranslationEvent(
    {
      type: "session.input_transcript.delta",
      delta: "duplicate source",
    },
    state,
    log.callbacks,
  );
  applyRealtimeTranslationEvent(
    {
      type: "session.output_transcript.delta",
      delta: "English text",
    },
    state,
    log.callbacks,
  );

  assert.deepEqual(log.source, ["fallback source"]);
  assert.deepEqual(log.translations, ["English text"]);
});

test("translation source deltas are ignored when input transcript is disabled", () => {
  const state = createRealtimeEventState(false);
  const log = createCallbackLog();

  applyRealtimeTranslationEvent(
    {
      type: "session.input_transcript.delta",
      delta: "source text",
    },
    state,
    log.callbacks,
  );
  applyRealtimeTranslationEvent(
    {
      type: "session.output_transcript.delta",
      delta: "translated text",
    },
    state,
    log.callbacks,
  );

  assert.deepEqual(log.source, []);
  assert.deepEqual(log.translations, ["translated text"]);
});

test("realtime event errors report state and useful fallback messages", () => {
  const state = createRealtimeEventState();
  const log = createCallbackLog();

  applyRealtimeTranscriptionEvent({ type: "error" }, state, log.callbacks);
  applyRealtimeTranslationEvent(
    {
      type: "error",
      error: { message: "translation failed" },
    },
    state,
    log.callbacks,
  );

  assert.deepEqual(log.states, ["Error", "Error"]);
  assert.deepEqual(log.logs, ["Realtime transcription failed.", "translation failed"]);
});
