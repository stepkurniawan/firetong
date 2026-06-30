import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CONFIG,
  createPauseDetector,
  missingBrowserFeatures,
} from "../firetong/static/app-core.js";

test("pause detector flushes after speech followed by a silence gap", () => {
  let currentTime = 0;
  let flushCount = 0;
  const detector = createPauseDetector({
    now: () => currentTime,
    onFlush: () => {
      flushCount += 1;
    },
  });

  detector.sample(0.12);
  currentTime = 300;
  detector.sample(0.01);
  assert.equal(flushCount, 0);

  currentTime = 500;
  assert.equal(detector.sample(0.01), true);
  assert.equal(flushCount, 1);
});

test("pause detector uses max chunk length as a fallback while speech continues", () => {
  let currentTime = 0;
  let flushCount = 0;
  const detector = createPauseDetector({
    maxChunkMs: 3000,
    now: () => currentTime,
    onFlush: () => {
      flushCount += 1;
    },
  });

  detector.sample(0.2);
  currentTime = 2999;
  detector.sample(0.2);
  assert.equal(flushCount, 0);

  currentTime = 3000;
  assert.equal(detector.sample(0.2), true);
  assert.equal(flushCount, 1);
});

test("default config uses OpenAI models for translation and transcription", () => {
  assert.equal(DEFAULT_CONFIG.openai_base_url, "https://api.openai.com/v1");
  assert.equal(DEFAULT_CONFIG.translation_model, "gpt-4o-mini");
  assert.equal(DEFAULT_CONFIG.transcription_model, "whisper-1");
});

test("browser feature check reports missing capture prerequisites", () => {
  const missing = missingBrowserFeatures({}, {});

  assert.deepEqual(missing, [
    "screen audio capture",
    "audio recording",
    "audio analysis",
    "audio resampling",
  ]);
});

test("browser feature check accepts required capture primitives", () => {
  const missing = missingBrowserFeatures(
    {
      MediaRecorder: function MediaRecorder() {},
      AudioContext: function AudioContext() {},
      OfflineAudioContext: function OfflineAudioContext() {},
    },
    {
      mediaDevices: {
        getDisplayMedia() {},
      },
    },
  );

  assert.deepEqual(missing, []);
});
