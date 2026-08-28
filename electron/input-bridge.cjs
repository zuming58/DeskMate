const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const readline = require("readline");
const { parseBridgeLine, InputTriggerFilter } = require("./input-bridge-protocol.cjs");
const { randomUUID } = require("crypto");
const { encodeKeyboardConfig, encodeConfigReadRequest, parseConfigSnapshot } = require("./easyinput-config.cjs");

class InputBridgeManager extends EventEmitter {
  constructor({ executable, spawnImpl = spawn, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    super();
    this.executable = executable;
    this.spawnImpl = spawnImpl;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.filter = new InputTriggerFilter({ now });
    this.child = null;
    this.stopping = false;
    this.restartAttempts = 0;
    this.restartTimer = null;
    this.pendingConfig = null;
    this.pendingRead = null;
    this.status = { available: false, process: "stopped", boardConnected: false, restarts: 0, error: "" };
  }

  configure(value) { return this.filter.configure(value); }

  snapshot() { return { ...this.status, config: { ...this.filter.config } }; }

  start() {
    if (this.child || this.stopping) return this.snapshot();
    try {
      const child = this.spawnImpl(this.executable, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      this.child = child;
      this.status = { ...this.status, available: true, process: "running", error: "" };
      this.emit("status", this.snapshot());
      const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on("line", (line) => this.handleLine(line));
      child.stderr?.on("data", () => {});
      child.once("error", (error) => this.handleExit(error));
      child.once("exit", (code) => this.handleExit(code === 0 ? null : new Error(`input-bridge-exit-${code}`)));
    } catch (error) {
      this.handleExit(error);
    }
    return this.snapshot();
  }

  handleLine(line) {
    const event = parseBridgeLine(line);
    if (!event) return;
    const result = this.filter.accept(event);
    if (result.kind === "status") {
      this.restartAttempts = 0;
      this.status = { ...this.status, boardConnected: event.boardConnected, error: "" };
      this.emit("status", this.snapshot());
    }
    if (result.kind === "config-write" && this.pendingConfig?.requestId === event.requestId && !event.ok) this.finishConfig({ ok: false, reason: event.reason || "vendor-hid-write-failed" });
    if (result.kind === "config-ack" && this.pendingConfig) {
      const matches = event.bytes === this.pendingConfig.bytes && event.crc16 === this.pendingConfig.crc16;
      if (matches) this.finishConfig(event.ok && event.saved ? { ok: true, bytes: event.bytes, crc16: event.crc16, saved: true } : { ok: false, reason: event.ok ? "config-not-saved" : "config-rejected", bytes: event.bytes, crc16: event.crc16 });
    }
    if (result.kind === "config-progress" && this.pendingRead?.requestId === event.requestId) this.refreshReadTimeout();
    if (result.kind === "config-snapshot" && this.pendingRead?.requestId === event.requestId) {
      const snapshot = parseConfigSnapshot(event);
      this.finishRead(snapshot ? { ok: true, ...snapshot } : { ok: false, reason: "config-snapshot-invalid" });
    }
    if (result.kind === "host-action") this.emit("host-action", event);
    if (["trigger", "cancel", "diagnostic"].includes(result.kind)) this.emit(result.kind, event);
  }

  syncConfig(value) {
    if (this.pendingConfig) return Promise.resolve({ ok: false, reason: "config-sync-in-progress" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected" });
    let encoded;
    try { encoded = encodeKeyboardConfig(value); } catch (error) { return Promise.resolve({ ok: false, reason: error.message }); }
    const requestId = `cfg-${randomUUID()}`;
    return new Promise((resolve) => {
      const timeout = this.setTimer(() => this.finishConfig({ ok: false, reason: "config-ack-timeout" }), 8000);
      this.pendingConfig = { requestId, bytes: encoded.bytes, crc16: encoded.crc16, timeout, resolve };
      const command = { version: 1, type: "sync-config", requestId, bytes: encoded.bytes, crc16: encoded.crc16, reports: encoded.reports.map((report) => report.toString("base64")) };
      this.child.stdin.write(`${JSON.stringify(command)}\n`, (error) => { if (error) this.finishConfig({ ok: false, reason: "input-bridge-write-failed" }); });
    });
  }

  readConfig() {
    if (this.pendingRead) return Promise.resolve({ ok: false, reason: "config-read-in-progress" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected" });
    const requestId = `read-${randomUUID()}`;
    return new Promise((resolve) => {
      const timeout = this.setTimer(() => this.finishRead({ ok: false, reason: "config-read-timeout" }), 3000);
      this.pendingRead = { requestId, timeout, resolve };
      const numericId = (Date.now() >>> 0) || 1;
      this.pendingRead.numericId = numericId;
      const report = encodeConfigReadRequest(numericId);
      this.child.stdin.write(`${JSON.stringify({ version: 1, type: "read-config", requestId, report: report.toString("base64") })}\n`, (error) => { if (error) this.finishRead({ ok: false, reason: "input-bridge-write-failed" }); });
    });
  }

  finishConfig(result) {
    const pending = this.pendingConfig;
    if (!pending) return;
    this.pendingConfig = null;
    this.clearTimer(pending.timeout);
    pending.resolve(result);
  }

  finishRead(result) {
    const pending = this.pendingRead;
    if (!pending) return;
    this.pendingRead = null;
    this.clearTimer(pending.timeout);
    pending.resolve(result);
  }

  refreshReadTimeout() {
    const pending = this.pendingRead;
    if (!pending) return;
    this.clearTimer(pending.timeout);
    pending.timeout = this.setTimer(() => this.finishRead({ ok: false, reason: "config-read-timeout" }), 3000);
  }

  handleExit(error) {
    if (!this.child && this.stopping) return;
    this.child = null;
    this.finishConfig({ ok: false, reason: "input-bridge-exited" });
    this.finishRead({ ok: false, reason: "input-bridge-exited" });
    this.filter.reset();
    this.status = { ...this.status, process: this.stopping ? "stopped" : "restarting", boardConnected: false, error: error?.message || "" };
    this.emit("status", this.snapshot());
    if (this.stopping || this.restartTimer) return;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(this.restartAttempts, 5)));
    this.restartAttempts += 1;
    this.status.restarts += 1;
    this.restartTimer = this.setTimer(() => { this.restartTimer = null; this.start(); }, delay);
  }

  stop() {
    this.stopping = true;
    if (this.restartTimer) this.clearTimer(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    this.child = null;
    this.finishConfig({ ok: false, reason: "input-bridge-stopped" });
    this.finishRead({ ok: false, reason: "input-bridge-stopped" });
    child?.kill?.();
    this.filter.reset();
    this.status = { ...this.status, process: "stopped", boardConnected: false };
    this.emit("status", this.snapshot());
  }
}

module.exports = { InputBridgeManager };
