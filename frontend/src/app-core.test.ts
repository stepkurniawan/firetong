import assert from "node:assert/strict";
import test from "node:test";
import { missingBrowserFeatures } from "./app-core.ts";

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
