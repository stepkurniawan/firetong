import assert from "node:assert/strict";
import test from "node:test";
import { formatUsd } from "./ui-copy.ts";

test("formatUsd rounds visible costs up to one decimal place", () => {
  assert.equal(formatUsd(null), "--");
  assert.equal(formatUsd(0), "$0.0");
  assert.equal(formatUsd(0.001), "$0.1");
  assert.equal(formatUsd(0.1), "$0.1");
  assert.equal(formatUsd(0.101), "$0.2");
  assert.equal(formatUsd(1.21), "$1.3");
});
