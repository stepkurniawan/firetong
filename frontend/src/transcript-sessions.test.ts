import assert from "node:assert/strict";
import test from "node:test";
import { formatTranscriptDownload, hasSavedTranscriptContent } from "./transcript-sessions.ts";

test("hasSavedTranscriptContent allows output-only autosaves", () => {
  assert.equal(hasSavedTranscriptContent("", ""), false);
  assert.equal(hasSavedTranscriptContent("  ", "\n"), false);
  assert.equal(hasSavedTranscriptContent("Selamat pagi", ""), true);
  assert.equal(hasSavedTranscriptContent("", "Good morning"), true);
});

test("formatTranscriptDownload includes available source and translation text", () => {
  assert.equal(
    formatTranscriptDownload("Selamat pagi", "Good morning", "Indonesian", "English"),
    "Source transcript (Indonesian)\n\nSelamat pagi\n\n---\n\nTranslation (English)\n\nGood morning\n",
  );
  assert.equal(
    formatTranscriptDownload("", "Good morning", "Indonesian", "English"),
    "Translation (English)\n\nGood morning\n",
  );
  assert.equal(formatTranscriptDownload("", "", "Indonesian", "English"), "");
});
