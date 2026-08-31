const { randomUUID } = require("crypto");
const { completeConfigWrite } = require("./config-readback.cjs");
const { pcmLevel } = require("./easyinput-audio-source.cjs");
const { listAudioNetworkAdapters, mergeAudioSetupPatch, sanitizeAudioSetup, sanitizedAudioSetupDiff, validateAudioSetupInput } = require("./easyinput-audio-setup.cjs");

const MIC_TEST_LIMIT_MS = 30000;

function parseDeviceConfig(result) {
  if (!result?.ok) return { ok: false, reason: result?.reason || "config-device-disconnected" };
  let raw;
  try { raw = JSON.parse(result.json); } catch { return { ok: false, reason: "config-json-invalid" }; }
  return raw?.schema === "ai_keyboard.v1" ? { ok: true, raw, source: result.source } : { ok: false, reason: "config-schema-invalid" };
}

class EasyInputAudioManager {
  constructor({ source, readConfig, syncConfig, fingerprint, networkInterfaces, emit = () => {}, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.source = source;
    this.readConfig = readConfig;
    this.syncConfig = syncConfig;
    this.fingerprint = fingerprint;
    this.networkInterfaces = networkInterfaces;
    this.emit = emit;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.config = null;
    this.pending = null;
    this.micTest = null;
    this.source.onEvent = (event) => this.emit({ ...this.status(), ...event, setup: sanitizeAudioSetup(this.config, this.adapters()), micTest: Boolean(this.micTest), level: this.micTest?.level || 0 });
  }

  adapters() { return listAudioNetworkAdapters(this.networkInterfaces()); }
  publicAdapters() { return this.adapters().map(({ id, label }) => Object.freeze({ id, label })); }

  status() {
    return Object.freeze({ ...this.source.status(), setup: sanitizeAudioSetup(this.config, this.adapters()), micTest: Boolean(this.micTest), level: this.micTest?.level || 0 });
  }

  async applyConfig(raw) {
    this.config = raw;
    const setup = sanitizeAudioSetup(raw, this.adapters());
    if (!setup.configured) {
      await this.source.clearConfiguration("easyinput-audio-not-configured");
      return { ok: false, reason: "easyinput-audio-not-configured", status: this.status() };
    }
    const adapter = this.adapters().find((item) => item.id === setup.adapterId);
    const result = await this.source.configure({ bindAddress: adapter.address, port: setup.port });
    return { ...result, status: this.status() };
  }

  async refreshConfiguration() {
    const parsed = parseDeviceConfig(await this.readConfig());
    if (!parsed.ok) {
      await this.source.clearConfiguration(parsed.reason);
      return parsed;
    }
    return this.applyConfig(parsed.raw);
  }

  setupSnapshot() {
    const setup = sanitizeAudioSetup(this.config, this.adapters());
    return Object.freeze({ ok: true, setup, adapters: this.publicAdapters(), defaults: { port: setup.port || 17333 } });
  }

  async previewSetup(value) {
    const parsed = parseDeviceConfig(await this.readConfig());
    if (!parsed.ok) return parsed;
    let input;
    try { input = validateAudioSetupInput(value, this.adapters()); }
    catch (error) { return { ok: false, reason: error.message }; }
    let merged;
    try { merged = mergeAudioSetupPatch(parsed.raw, input); }
    catch (error) { return { ok: false, reason: error.message }; }
    const token = randomUUID();
    this.pending = { token, expires: this.now() + 60000, fingerprint: this.fingerprint(parsed.raw), merged, adapterLabel: input.adapterLabel };
    return { ok: true, token, expiresInMs: 60000, diff: sanitizedAudioSetupDiff(parsed.raw, merged, input.adapterLabel) };
  }

  async commitSetup(token) {
    const pending = this.pending;
    this.pending = null;
    if (!pending || token !== pending.token || this.now() > pending.expires) return { ok: false, reason: "config-confirmation-expired" };
    const parsed = parseDeviceConfig(await this.readConfig());
    if (!parsed.ok) return parsed;
    if (this.fingerprint(parsed.raw) !== pending.fingerprint) return { ok: false, reason: "config-changed-concurrently" };
    const verified = await completeConfigWrite({ syncConfig: this.syncConfig, readConfig: this.readConfig, expectedConfig: pending.merged, fingerprint: this.fingerprint });
    if (!verified.ok) return verified;
    await this.applyConfig(verified.config);
    return { ok: true, saved: true, source: verified.source, fingerprint: verified.fingerprint, verificationAttempts: verified.attempts, setup: sanitizeAudioSetup(verified.config, this.adapters()) };
  }

  async startMicTest({ canStart = () => ({ ok: true }) } = {}) {
    if (this.micTest) return { ok: false, reason: "easyinput-mic-test-active", status: this.status() };
    const gate = canStart();
    if (!gate?.ok) return { ok: false, reason: gate?.reason || "audio-owner-busy", status: this.status() };
    let lastLevelAt = 0;
    const test = { level: 0, timer: null };
    this.micTest = test;
    const result = await this.source.start({
      onAudio: (pcm) => {
        const current = this.now();
        if (current - lastLevelAt < 100 || this.micTest !== test) return;
        lastLevelAt = current;
        test.level = pcmLevel(pcm);
        this.emit({ type: "level", level: test.level, micTest: true, status: this.source.status().state });
      },
      onError: (error) => { this.emit({ type: "error", error: String(error?.message || "easyinput-audio-test-failed"), micTest: true }); void this.stopMicTest("source-error"); },
    });
    if (!result.ok) { this.micTest = null; return { ...result, status: this.status() }; }
    test.timer = this.setTimer(() => void this.stopMicTest("test-time-limit"), MIC_TEST_LIMIT_MS);
    this.emit({ type: "mic-test-started", level: 0, micTest: true });
    return { ok: true, status: this.status(), limitMs: MIC_TEST_LIMIT_MS };
  }

  async stopMicTest(reason = "user") {
    const test = this.micTest;
    this.micTest = null;
    if (test?.timer) this.clearTimer(test.timer);
    await this.source.stop(reason);
    this.emit({ type: "mic-test-stopped", reason, level: 0, micTest: false });
    return { ok: true, alreadyStopped: !test, status: this.status() };
  }

  async suspend(reason = "device-disconnected") {
    await this.stopMicTest(reason);
    await this.source.closeSocket();
    this.emit({ type: "status", ...this.status(), reason });
    return { ok: true };
  }

  async close() {
    await this.stopMicTest("application-quit");
    await this.source.close();
  }
}

module.exports = { EasyInputAudioManager, MIC_TEST_LIMIT_MS, parseDeviceConfig };
