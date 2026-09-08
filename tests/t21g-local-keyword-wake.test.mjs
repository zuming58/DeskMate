import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  REQUIRED_MODEL_FILES,
  SHERPA_WAKE_VERSION,
  SherpaKeywordWakeWordAdapter,
  buildKeywordLines,
  hasSignal,
  pcm16ToFloat32,
} = require("../electron/sherpa-keyword-wake-adapter.cjs");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-kws-test-"));
  for (const filename of Object.values(REQUIRED_MODEL_FILES)) fs.writeFileSync(path.join(root, filename), filename === "tokens.txt" ? "x 1\niǎo 2\nl 3\nán 4\nn 5\nǐ 6\nh 7\nǎo 8\n" : "fixture");
  return root;
}

class FakeKeywordSpotter {
  static configs = [];
  constructor(config) {
    this.config = config;
    this.keywordLines = fs.readFileSync(config.keywordsFile, "utf8");
    this.result = "";
    FakeKeywordSpotter.configs.push(config);
  }
  createStream() { return { samples: new Float32Array(), acceptWaveform: ({ samples }) => { this.pending = samples; } }; }
  isReady() { return Boolean(this.pending); }
  decode() {
    if ([...(this.pending || [])].some((sample) => Math.abs(sample) > 0.05)) this.result = "wake1";
    this.pending = null;
  }
  getResult() { return { keyword: this.result }; }
  reset() { this.result = ""; }
}

test("T21G converts configurable Chinese phrases into bounded pinyin keyword tokens", () => {
  const lines = buildKeywordLines(["小岚,小岚", "小岚小岚", "你好，小岚"]);
  assert.deepEqual(lines, ["x iǎo l án x iǎo l án @wake1", "n ǐ h ǎo x iǎo l án @wake2"]);
  assert.deepEqual(buildKeywordLines(["hello", "!", "小"]), []);
});

test("T21G PCM conversion and signal evidence are bounded and content free", () => {
  assert.equal(pcm16ToFloat32(Buffer.alloc(3)), null);
  assert.equal(pcm16ToFloat32(Buffer.alloc(64 * 1024 + 2)), null);
  const pcm = Buffer.alloc(4);
  pcm.writeInt16LE(16384, 0);
  pcm.writeInt16LE(-16384, 2);
  const samples = pcm16ToFloat32(pcm);
  assert.deepEqual([...samples], [0.5, -0.5]);
  assert.equal(hasSignal(samples), true);
  assert.equal(hasSignal(new Float32Array(128)), false);
});

test("T21G local keyword adapter owns selected PCM, wakes once and removes its ephemeral phrase file", async () => {
  FakeKeywordSpotter.configs.length = 0;
  const root = createFixture();
  let wakes = 0;
  let inputStarts = 0;
  let inputStops = 0;
  const adapter = new SherpaKeywordWakeWordAdapter({
    platform: "win32",
    modelDirectory: root,
    temporaryDirectory: root,
    engineLoader: () => ({ KeywordSpotter: FakeKeywordSpotter }),
    onWake: () => { wakes += 1; },
    onInputStart: () => { inputStarts += 1; },
    onInputStop: () => { inputStops += 1; },
  });
  try {
    assert.equal((await adapter.probe()).available, true);
    adapter.configure({ enabled: true, phrases: ["小岚小岚"] });
    assert.equal((await adapter.start()).ok, true);
    assert.equal(inputStarts, 1);
    assert.equal(adapter.markInputReady(), true);
    const silence = Buffer.alloc(640);
    assert.equal(adapter.writeAudio(silence), true);
    assert.equal(wakes, 0);
    const voice = Buffer.alloc(640);
    for (let offset = 0; offset < voice.length; offset += 2) voice.writeInt16LE(4096, offset);
    assert.equal(adapter.writeAudio(voice), true);
    assert.equal(wakes, 1);
    assert.equal(adapter.status().version, SHERPA_WAKE_VERSION);
    assert.equal(adapter.status().inputMode, "deskmate-selected-microphone");
    assert.equal(adapter.status().audioWindowCount, 2);
    assert.equal(adapter.status().signalWindowCount, 1);
    assert.equal(adapter.status().wakeCount, 1);
    assert.doesNotMatch(JSON.stringify(adapter.status()), /小岚|iǎo|wake1/);
    assert.equal(FakeKeywordSpotter.configs.length, 1);
    assert.equal(fs.existsSync(FakeKeywordSpotter.configs[0].keywordsFile), false);
    await adapter.stop();
    assert.equal(inputStops, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T21G fails closed when a custom phrase cannot be represented by the local model", async () => {
  const root = createFixture();
  const adapter = new SherpaKeywordWakeWordAdapter({ platform: "win32", modelDirectory: root, temporaryDirectory: root, engineLoader: () => ({ KeywordSpotter: FakeKeywordSpotter }) });
  try {
    await adapter.probe();
    adapter.configure({ enabled: true, phrases: ["DeskMate"] });
    const result = await adapter.start();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "wake-word-phrase-unsupported");
    assert.equal(adapter.status().enabled, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T21G package uses the dedicated KWS adapter and ships its four pinned model files", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(main, /SherpaKeywordWakeWordAdapter/);
  assert.doesNotMatch(main, /new WindowsSpeechWakeWordAdapter/);
  assert.match(pages, /专用离线关键词模型/);
  assert.ok(packageJson.build.extraResources.some((item) => item.from === "resources/wake-model" && item.to === "wake-model"));
  for (const filename of Object.values(REQUIRED_MODEL_FILES)) assert.equal(fs.existsSync(new URL(`../resources/wake-model/${filename}`, import.meta.url)), true);
});

