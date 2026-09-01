import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
const preload = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
const setupPreload = fs.readFileSync(new URL("../electron/audio-setup-preload.cjs", import.meta.url), "utf8");
const setupHtml = fs.readFileSync(new URL("../electron/audio-setup.html", import.meta.url), "utf8");
const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");

test("production companion uses locked selected input and computer speaker without guessing EasyInput downlink", () => {
  assert.match(main, /new PrestartFallbackCompanionAudioSource/);
  assert.match(main, /audioSource:\s*computerCompanionAudio\.source/);
  assert.match(main, /audioSink:\s*computerCompanionAudio\.sink/);
  assert.match(main, /companionSource === "easyinput"/);
  assert.doesNotMatch(main, /new UnavailableCompanionAudioSource\(\)/);
  assert.match(pages, /EasyInput 扬声器.*待协议冻结/);
  assert.doesNotMatch(main, /EISD|EISA|speaker.*udp/i);
});

test("main renderer receives only sanitized audio APIs and never setup secrets", () => {
  for (const method of ["getEasyInputAudioStatus", "openEasyInputAudioSetup", "startEasyInputMicTest", "stopEasyInputMicTest", "onEasyInputAudioEvent"]) assert.match(preload, new RegExp(method));
  assert.doesNotMatch(preload, /wifi_ssid|wifi_password|audio_host|rawPcm|pcm/i);
  assert.doesNotMatch(pages, /wifi_password|audio_host|192\.168\.|raw PCM/);
});

test("voice workflow can select the board recorder without exposing a live audio stream", () => {
  for (const method of ["startEasyInputVoiceRecording", "stopEasyInputVoiceRecording", "cancelEasyInputVoiceRecording", "onEasyInputVoiceRecordingEvent"]) assert.match(preload, new RegExp(method));
  assert.match(main, /new EasyInputVoiceRecorder/);
  assert.match(pages, /EasyInput 板载麦克风（Wi-Fi）/);
  assert.match(pages, /蓝牙麦克风（待接入）/);
  assert.match(pages, /startMicrophoneSession/);
});

test("ordinary global shortcuts default off while board-native voice input remains explicit", () => {
  assert.match(main, /globalKeyboardShortcutsEnabled = false/);
  assert.match(main, /setGlobalShortcutsEnabled\(false\)/);
  assert.doesNotMatch(main, /registerShortcut\(DEFAULT_SHORTCUT\);/);
  assert.match(pages, /普通键盘全局快捷键/);
  assert.match(pages, /EasyInput 按键 · 原生监听/);
});

test("credential window is isolated and has a strict local CSP", () => {
  assert.match(main, /audio-setup-preload\.cjs[\s\S]*nodeIntegration:\s*false[\s\S]*contextIsolation:\s*true[\s\S]*sandbox:\s*true/);
  assert.match(setupPreload, /audio-setup:preview/);
  assert.doesNotMatch(setupPreload, /desktop:get|companion:|bailian:/);
  assert.match(setupHtml, /default-src 'self'/);
  assert.match(setupHtml, /connect-src 'none'/);
});

test("dictation preempts mic diagnostic and all foreground audio owners are mutually exclusive", () => {
  assert.match(main, /stopMicTest\("dictation-preempted"\)/);
  assert.match(main, /voice-workflow-active/);
  assert.match(main, /companion-conversation-active/);
  assert.match(main, /easyinput-mic-test-active/);
});
