import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createLocalDanceMusicEngine } from "../src/domain/localDanceMusic.js";
import { createMotionCueWav, MOTION_CUE_DURATION_MS, SAMPLE_RATE } from "../src/domain/generatedMotionAudio.js";

const require = createRequire(import.meta.url);
const { CompanionIntentBridge, localMediaCommandFromUtterance, matchRegisteredApplication } = require("../electron/companion-intent-bridge.cjs");
const { LocalDanceMusicStore, MAX_TRACK_BYTES } = require("../electron/local-dance-music.cjs");

const actionId = "12345678-1234-1234-1234-123456789abc";

test("registered application names are matched deterministically without asking a model", async () => {
  let modelCalls = 0;
  let opened = 0;
  let voiceEnabled = true;
  const appActions = {
    listRegistered: () => [{ id: actionId, label: "网易云音乐", voiceEnabled }],
    describe: () => ({ id: actionId, label: "网易云音乐", voiceEnabled }),
    executeVoice: async () => { opened += 1; return { ok: true, label: "网易云音乐" }; },
  };
  const bridge = new CompanionIntentBridge({ appActions, requestJson: async () => { modelCalls += 1; return { type: "none" }; } });
  assert.equal(bridge.claimsTurn("小智小智，帮我打开网易云音乐"), true);
  assert.equal((await bridge.analyze("小智小智，帮我打开网易云音乐")).result.label, "网易云音乐");
  assert.equal(opened, 1);
  assert.equal(modelCalls, 0);
  voiceEnabled = false;
  assert.equal((await bridge.analyze("打开网易云音乐")).reason, "application-voice-not-enabled");
  assert.equal(opened, 1);
  assert.equal(bridge.claimsTurn("不要打开网易云音乐"), false);
  assert.equal(matchRegisteredApplication("不要打开网易云音乐", appActions.listRegistered()).action, null);
});

test("ambiguous same-length application names fail closed", async () => {
  const apps = [
    { id: actionId, label: "音乐甲", voiceEnabled: true },
    { id: "22345678-1234-1234-1234-123456789abc", label: "音乐乙", voiceEnabled: true },
  ];
  const match = matchRegisteredApplication("打开音乐甲和音乐乙", apps);
  assert.equal(match.ambiguous, true);
  const bridge = new CompanionIntentBridge({ appActions: { listRegistered: () => apps } });
  assert.equal((await bridge.analyze("打开音乐甲和音乐乙")).reason, "intent-application-ambiguous");
});

test("generic local music commands are deterministic and successful playback stays silent", async () => {
  const calls = [];
  const bridge = new CompanionIntentBridge({ appActions: { listRegistered: () => [] }, mediaAction: async (command) => { calls.push(command); return { ok: true }; } });
  assert.equal(localMediaCommandFromUtterance("小智，播放个音乐"), "play");
  assert.equal(localMediaCommandFromUtterance("把音乐停掉"), "stop");
  const played = await bridge.analyze("小智，播放个音乐");
  assert.equal(played.result.silent, true);
  assert.deepEqual(calls, ["play"]);
  await bridge.analyze("把音乐停掉");
  assert.deepEqual(calls, ["play", "stop"]);
});

test("local dance music keeps the selected path encrypted and exposes only bounded media", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-music-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const track = path.join(root, "my-dance.mp3");
  fs.writeFileSync(track, Buffer.from([1, 2, 3, 4]));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").slice("encrypted:".length),
  };
  const store = new LocalDanceMusicStore({ userDataPath: root, safeStorage, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [track] }) } });
  const selected = await store.choose(null);
  assert.equal(selected.ok, true);
  assert.equal(selected.enabled, true);
  assert.equal(selected.label, "my-dance");
  assert.equal(fs.readFileSync(path.join(root, "local-dance-music.json"), "utf8").includes(track), false);
  assert.deepEqual([...store.readTrack().data], [1, 2, 3, 4]);
  assert.equal(store.setEnabled(false).enabled, false);
  assert.equal(MAX_TRACK_BYTES, 32 * 1024 * 1024);
});

test("renderer music engine loads one bounded track and stops stale playback", async () => {
  const events = [];
  const audio = { src: "", volume: 0, currentTime: 0, pauseCalls: 0, playCalls: 0, pause() { this.pauseCalls += 1; }, async play() { this.playCalls += 1; } };
  const bridge = { loadDanceMusic: async () => ({ ok: true, mimeType: "audio/mpeg", data: new Uint8Array([1, 2]) }), sendDanceMusicPlaybackEvent: (value) => events.push(value) };
  const revoked = [];
  const engine = createLocalDanceMusicEngine({ bridge, audioFactory: () => audio, createObjectURL: () => "blob:track", revokeObjectURL: (value) => revoked.push(value) });
  assert.equal((await engine.handleCommand({ type: "play", requestId: "one" })).ok, true);
  assert.equal(audio.playCalls, 1);
  assert.equal(events.at(-1).state, "playing");
  await engine.handleCommand({ type: "stop", requestId: "one" });
  assert.equal(audio.pauseCalls, 1);
  assert.deepEqual(revoked, ["blob:track"]);
  assert.equal(events.at(-1).state, "idle");
});

test("built-in motion audio is generated locally for every frozen preset", async () => {
  for (const preset of ["attention", "nod", "search", "dance"]) {
    const wav = createMotionCueWav(preset);
    assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(wav.slice(8, 12)), "WAVE");
    assert.equal(wav.byteLength, 44 + Math.ceil(SAMPLE_RATE * MOTION_CUE_DURATION_MS[preset] / 1000) * 2);
  }
  let localReads = 0;
  const audio = { src: "", volume: 0, currentTime: 0, pause() {}, async play() {} };
  const events = [];
  const engine = createLocalDanceMusicEngine({
    bridge: { loadDanceMusic: async () => { localReads += 1; return { ok: false }; }, sendDanceMusicPlaybackEvent: (value) => events.push(value) },
    audioFactory: () => audio,
    createObjectURL: () => "blob:generated-cue",
    revokeObjectURL: () => {},
  });
  assert.equal((await engine.handleCommand({ type: "synthesize", preset: "dance", requestId: "built-in" })).ok, true);
  assert.equal(localReads, 0);
  assert.equal(events.at(-1).state, "playing");
  engine.close();
});

test("desktop surface exposes app whitelist and dance music without renderer paths", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(main, /desktop:list-registered-applications/);
  assert.match(main, /runMotionPreset[\s\S]*startDanceMusic/);
  assert.match(main, /runCustomChoreography[\s\S]*startDanceMusic/);
  assert.match(main, /desktop:emergency-stop-motion[\s\S]*stopDanceMusic/);
  assert.match(preload, /onDanceMusicCommand/);
  assert.match(pages, /直接说“打开网易云音乐”/);
  assert.match(pages, /跳舞配乐/);
  assert.match(pages, /跳舞使用内置电子节拍/);
  assert.match(main, /startDanceMusic\(\{ preset \}\)/);
  assert.doesNotMatch(preload, /danceMusicPath|selectedMusicPath/);
});
