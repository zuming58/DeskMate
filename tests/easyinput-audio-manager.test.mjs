import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EasyInputAudioManager } = require("../electron/easyinput-audio-manager.cjs");
const { configFingerprint } = require("../electron/config-merge.cjs");

class FakeSource {
  constructor() { this.value = { available: false, configured: false, state: "not-configured", counters: {} }; this.handlers = null; this.onEvent = () => {}; }
  status() { return { ...this.value }; }
  async configure() { this.value = { available: true, configured: true, state: "ready", counters: {} }; this.onEvent({ type: "status", ...this.value }); return { ok: true }; }
  async clearConfiguration(reason) { this.value = { available: false, configured: false, state: "not-configured", reason, counters: {} }; return { ok: true }; }
  async start(handlers) { this.handlers = handlers; this.value.state = "streaming"; return { ok: true }; }
  async stop() { this.handlers = null; this.value.state = "ready"; return { ok: true }; }
  async close() {}
}

const interfaces = () => ({ "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.2.8", netmask: "255.255.255.0" }] });

test("manager previews, writes, rereads and never returns Wi-Fi secrets", async () => {
  let raw = { schema: "ai_keyboard.v1", wifi_ssid: "", wifi_password: "", audio_host: "", audio_port: 17333, profiles: [{ keys: { KEY1: { press: "voice_ptt_hold" } } }], future: { keep: true } };
  const source = new FakeSource();
  const manager = new EasyInputAudioManager({ source, readConfig: async () => ({ ok: true, json: JSON.stringify(raw), source: 1 }), syncConfig: async (value) => { raw = structuredClone(value); return { ok: true }; }, fingerprint: configFingerprint, networkInterfaces: interfaces });
  const adapterId = manager.setupSnapshot().adapters[0].id;
  const preview = await manager.previewSetup({ ssid: "PrivateWifi", password: "PrivatePassword", adapterId, port: 17333 });
  assert.equal(preview.ok, true);
  assert.equal(JSON.stringify(preview).includes("PrivateWifi"), false);
  assert.equal(JSON.stringify(preview).includes("PrivatePassword"), false);
  const committed = await manager.commitSetup(preview.token);
  assert.equal(committed.ok, true);
  assert.equal(raw.future.keep, true);
  assert.equal(raw.profiles[0].keys.KEY1.press, "voice_ptt_hold");
  assert.equal(JSON.stringify(committed).includes("PrivatePassword"), false);
  assert.equal(manager.status().setup.configured, true);
});
test("manager fails closed when fingerprint changes or token is reused", async () => {
  let raw = { schema: "ai_keyboard.v1", wifi_ssid: "", wifi_password: "", audio_host: "", audio_port: 17333 };
  const manager = new EasyInputAudioManager({ source: new FakeSource(), readConfig: async () => ({ ok: true, json: JSON.stringify(raw) }), syncConfig: async () => ({ ok: true }), fingerprint: configFingerprint, networkInterfaces: interfaces });
  const preview = await manager.previewSetup({ ssid: "x", password: "", adapterId: manager.setupSnapshot().adapters[0].id, port: 17333 });
  raw.concurrent = true;
  assert.equal((await manager.commitSetup(preview.token)).reason, "config-changed-concurrently");
  assert.equal((await manager.commitSetup(preview.token)).reason, "config-confirmation-expired");
});

test("mic test emits only a numeric level and can be stopped", async () => {
  const events = [];
  const source = new FakeSource();
  const manager = new EasyInputAudioManager({ source, readConfig: async () => ({ ok: false }), syncConfig: async () => ({ ok: false }), fingerprint: configFingerprint, networkInterfaces: interfaces, emit: (event) => events.push(event), now: (() => { let value = 0; return () => (value += 101); })() });
  assert.equal((await manager.startMicTest()).ok, true);
  const pcm = Buffer.alloc(640); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(5000, i);
  source.handlers.onAudio(pcm);
  assert.equal(events.at(-1).type, "level");
  assert.equal(typeof events.at(-1).level, "number");
  assert.equal(Object.values(events.at(-1)).some((value) => Buffer.isBuffer(value)), false);
  assert.equal((await manager.stopMicTest()).ok, true);
});
