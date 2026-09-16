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

test("configured ASCII hotwords correct separated letters, digits, casing and punctuation", () => {
  assert.equal(normalizeTranscript("连接 E S P 3 2 - S 3 开发板", { hotwords: ["ESP32-S3"] }).normalized, "连接 ESP32-S3 开发板");
  assert.equal(normalizeTranscript("做 S E O 优化", { hotwords: ["SEO"] }).normalized, "做 SEO 优化");
  assert.equal(normalizeTranscript("way to A G I 社区", { hotwords: ["WaytoAGI"] }).normalized, "WaytoAGI 社区");
});

test("WaytoAGI corrects the provider's common spoken variants only when configured", () => {
  for (const [source, expected] of [["V two A G I社区", "WaytoAGI社区"], ["V 2 A G I 社区", "WaytoAGI 社区"], ["Way too A G I 社区", "WaytoAGI 社区"], ["维图 A G I 社区", "WaytoAGI 社区"]]) {
    assert.equal(normalizeTranscript(source, { hotwords: ["WaytoAGI"] }).normalized, expected, source);
  }
  assert.equal(normalizeTranscript("V two A G I社区", { hotwords: [] }).normalized, "V two A G I社区");
  assert.equal(normalizeTranscript("notVtwoAGIX", { hotwords: ["WaytoAGI"] }).normalized, "notVtwoAGIX");
});

test("custom Chinese hotwords do not fuzzy-replace unrelated homophones", () => {
  assert.equal(normalizeTranscript("小兰正在说话", { hotwords: ["小岚"] }).normalized, "小兰正在说话");
});
