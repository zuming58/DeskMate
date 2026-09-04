import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeTranscript } = require("../electron/transcript-normalizer.cjs");

test("technical aliases are corrected only when their canonical hotword is configured", () => {
  assert.equal(normalizeTranscript("Code S 进行到哪一步", { hotwords: ["Codex"] }).normalized, "Codex 进行到哪一步");
  assert.equal(normalizeTranscript("扣德克斯 进行到哪一步", { hotwords: ["Codex"] }).normalized, "Codex 进行到哪一步");
  assert.equal(normalizeTranscript("Code S 进行到哪一步", { hotwords: [] }).normalized, "Code S 进行到哪一步");
});

test("explicit replacement rules and configured hotwords share one deterministic pipeline", () => {
  const result = normalizeTranscript("桌面宠物问 Code X", { hotwords: ["Codex"], rules: [{ from: "桌面宠物", to: "桌宠" }] });
  assert.equal(result.normalized, "桌宠问 Codex");
  assert.deepEqual(result.matched, ["replacement-rule", "hotword:codex"]);
});
