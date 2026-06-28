import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CONFIG,
  SERMON_TRANSLATOR_PROMPT,
  buildTranslationRequest,
  createPauseDetector,
  missingBrowserFeatures,
} from "../firetongue/static/app-core.js";

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
  currentTime = 600;
  detector.sample(0.01);
  assert.equal(flushCount, 0);

  currentTime = 1100;
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

test("translation request preserves the Christian sermon prompt and model", () => {
  const request = buildTranslationRequest({
    config: DEFAULT_CONFIG,
    apiKey: "test-key",
    text: "Tuhan itu baik.",
  });
  const body = JSON.parse(request.options.body);

  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.equal(body.model, "gpt-4o-mini");
  assert.equal(body.messages[0].content, SERMON_TRANSLATOR_PROMPT);
  assert.match(body.messages[0].content, /Roh Kudus/);
  assert.equal(body.messages[1].content, "Tuhan itu baik.");
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
