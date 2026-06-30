import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CONFIG,
  missingBrowserFeatures,
} from "../firetong/static/app-core.js";

test("default config exposes browser runtime settings", () => {
  assert.equal(DEFAULT_CONFIG.openai_base_url, "https://api.openai.com/v1");
  assert.equal(DEFAULT_CONFIG.translation_model, "gpt-4o-mini");
  assert.equal(DEFAULT_CONFIG.live_translation_debounce_ms, 2000);
  assert.equal(DEFAULT_CONFIG.live_translation_force_words, 20);
});

test("browser feature check reports missing capture prerequisites", () => {
  const missing = missingBrowserFeatures({}, {});

  assert.deepEqual(missing, [
    "screen audio capture",
    "realtime audio streaming",
    "audio analysis",
  ]);
});

test("browser feature check accepts required capture primitives", () => {
  const missing = missingBrowserFeatures(
    {
      RTCPeerConnection: function RTCPeerConnection() {},
      AudioContext: function AudioContext() {},
    },
    {
      mediaDevices: {
        getDisplayMedia() {},
      },
    },
  );

  assert.deepEqual(missing, []);
});
