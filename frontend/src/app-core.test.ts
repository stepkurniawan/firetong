import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRealtimeLanguageUrl,
  firstDifferentRealtimeLanguage,
  hasDistinctRealtimeLanguages,
  missingBrowserFeatures,
} from "./app-core.ts";

test("missingBrowserFeatures returns no missing features when required browser APIs exist", () => {
  const browserWindow = {
    RTCPeerConnection: class {},
    AudioContext: class {},
  } as unknown as Window;
  const browserNavigator = {
    mediaDevices: {
      getDisplayMedia: () => Promise.resolve({}),
      getUserMedia: () => Promise.resolve({}),
    },
  } as Navigator;

  assert.deepEqual(missingBrowserFeatures(browserWindow, browserNavigator), []);
});

test("missingBrowserFeatures allows microphone-only capture support", () => {
  const browserWindow = {
    RTCPeerConnection: class {},
    AudioContext: class {},
  } as unknown as Window;
  const browserNavigator = {
    mediaDevices: {
      getUserMedia: () => Promise.resolve({}),
    },
  } as Navigator;

  assert.deepEqual(missingBrowserFeatures(browserWindow, browserNavigator), []);
});

test("missingBrowserFeatures lists missing capture, streaming, and analysis support", () => {
  assert.deepEqual(missingBrowserFeatures({} as Window, {} as Navigator), [
    "audio capture",
    "realtime audio streaming",
    "audio analysis",
  ]);
});

test("hasDistinctRealtimeLanguages rejects matching language pairs", () => {
  assert.equal(hasDistinctRealtimeLanguages("id", "en"), true);
  assert.equal(hasDistinctRealtimeLanguages("en", "en"), false);
});

test("firstDifferentRealtimeLanguage returns a different supported language", () => {
  assert.notEqual(firstDifferentRealtimeLanguage("id"), "id");
  assert.notEqual(firstDifferentRealtimeLanguage("en"), "en");
  assert.notEqual(firstDifferentRealtimeLanguage("de"), "de");
  assert.notEqual(firstDifferentRealtimeLanguage("ja"), "ja");
});

test("buildRealtimeLanguageUrl can include both realtime language params", () => {
  assert.equal(
    buildRealtimeLanguageUrl("/api/realtime/token", "input_language", "id", {
      output_language: "en",
    }),
    "/api/realtime/token?input_language=id&output_language=en",
  );
});
