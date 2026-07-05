import assert from "node:assert/strict";
import test from "node:test";
import { hasSavedTranscriptContent } from "./transcript-sessions.ts";

test("hasSavedTranscriptContent allows output-only autosaves", () => {
  assert.equal(hasSavedTranscriptContent("", ""), false);
  assert.equal(hasSavedTranscriptContent("  ", "\n"), false);
  assert.equal(hasSavedTranscriptContent("Selamat pagi", ""), true);
  assert.equal(hasSavedTranscriptContent("", "Good morning"), true);
});
