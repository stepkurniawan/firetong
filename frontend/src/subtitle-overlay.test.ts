import assert from "node:assert/strict";
import test from "node:test";
import { latestSubtitleText } from "./subtitle-overlay.ts";

test("latestSubtitleText returns the latest sentence after punctuation", () => {
  assert.equal(
    latestSubtitleText("Good morning. The Lord be with you."),
    "The Lord be with you.",
  );
});

test("latestSubtitleText treats consecutive punctuation as one sentence boundary", () => {
  assert.equal(
    latestSubtitleText("Can you hear this?! Yes, we can."),
    "Yes, we can.",
  );
});

test("latestSubtitleText returns the current phrase after the last completed sentence", () => {
  assert.equal(
    latestSubtitleText("Good morning. The sermon begins with"),
    "The sermon begins with",
  );
});

test("latestSubtitleText normalizes whitespace", () => {
  assert.equal(latestSubtitleText("  Peace   be\nwith   you.  "), "Peace be with you.");
});

test("latestSubtitleText falls back to the latest words without punctuation", () => {
  assert.equal(
    latestSubtitleText("one two three four five six", 3),
    "four five six",
  );
});

test("latestSubtitleText limits a long subtitle sentence", () => {
  assert.equal(
    latestSubtitleText("Intro. one two three four five six seven eight nine", 4),
    "six seven eight nine",
  );
});
