const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const readline = require("readline");
const { parseBridgeLine, InputTriggerFilter } = require("./input-bridge-protocol.cjs");
const { randomUUID } = require("crypto");
const { encodeKeyboardConfig, encodeConfigReadRequest, parseConfigSnapshot } = require("./easyinput-config.cjs");
const { decodeManualCalibrationFeatureReport } = require("./manual-calibration-hid.cjs");

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
    this.pendingFixedText = null;
    this.pendingPaste = null;
    this.pendingCapture = null;
    this.pendingAgentState = null;
    this.queuedAgentState = null;
    this.pendingManualCalibration = null;
    this.status = { available: false, process: "stopped", boardConnected: false, configCollectionWritable: false, calibrationCollectionWritable: false, restarts: 0, error: "", configCapabilities: null, linkDiagnostics: null };
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
      const configCollectionWritable = event.boardConnected
        ? (event.configCollectionWritable ?? (this.status.boardConnected ? this.status.configCollectionWritable : null))
        : false;
      const calibrationCollectionWritable = event.boardConnected
        ? (event.calibrationCollectionWritable ?? (this.status.boardConnected ? this.status.calibrationCollectionWritable : null))
        : false;
      this.status = {
        ...this.status,
        boardConnected: event.boardConnected,
        configCollectionWritable,
        calibrationCollectionWritable,
        error: "",
        ...(!event.boardConnected || configCollectionWritable === false ? { configCapabilities: null, linkDiagnostics: null } : {}),
      };
      this.emit("status", this.snapshot());
      if (!event.boardConnected) {
        this.finishFixedText({ ok: false, reason: "easyinput-disconnected", bytes: 0 });
        this.failAllAgentStates("easyinput-disconnected");
        this.finishManualCalibration({ ok: false, reason: "easyinput-disconnected" });
      } else {
        if (configCollectionWritable === false) {
          this.finishConfig({ ok: false, reason: "config-interface-unavailable" });
          this.finishRead({ ok: false, reason: "config-interface-unavailable" });
          this.failAllAgentStates("config-interface-unavailable");
        }
        if (calibrationCollectionWritable === false) this.finishManualCalibration({ ok: false, reason: "manual-calibration-interface-unavailable" });
      }
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
    if (result.kind === "config-capabilities" && this.pendingRead?.requestId === event.requestId) {
      const capabilities = { config_read_v1: event.configReadV1, config_write_v1: event.configWriteV1, host_action_v1: event.hostActionV1, fixed_text_v1: event.fixedTextV1, ...(event.deskMateLinkV1 === undefined ? {} : { deskmate_link_v1: event.deskMateLinkV1, agent_state_bridge_v1: event.agentStateBridgeV1 }) };
      const linkDiagnostics = event.linkState === undefined ? null : {
        state: event.linkState,
        rxFrames: event.linkRxFrames,
        txFrames: event.linkTxFrames,
        requestTimeouts: event.linkRequestTimeouts,
        retries: event.linkRetries,
        peerRestarts: event.linkPeerRestarts,
        agentAccepted: event.agentAccepted,
        agentMalformed: event.agentMalformed,
        agentDroppedDisconnected: event.agentDroppedDisconnected,
        agentForwarded: event.agentForwarded,
        agentQueueDrops: event.agentQueueDrops,
      };
      this.status = { ...this.status, configCapabilities: capabilities, linkDiagnostics };
      this.finishRead({ ok: true, capabilities, ...(linkDiagnostics ? { linkDiagnostics } : {}) });
      this.emit("status", this.snapshot());
    }
    if (result.kind === "host-action") this.emit("host-action", event);
    if (result.kind === "fixed-text") this.emit("fixed-text", event);
    if (result.kind === "fixed-text-result" && this.pendingFixedText?.requestId === event.requestId) {
      this.finishFixedText(event.ok ? { ok: true, bytes: event.bytes } : { ok: false, reason: event.reason || "fixed-text-injection-failed", bytes: event.bytes });
    }
    if (result.kind === "desktop-output-result" && this.pendingPaste?.requestId === event.requestId) {
      this.finishPaste(event.ok ? { ok: true } : { ok: false, reason: event.reason || "active-window-output-failed" });
    }
    if (result.kind === "desktop-window-result" && this.pendingCapture?.requestId === event.requestId) {
      this.finishCapture(event.ok ? { ok: true, targetWindow: event.targetWindow } : { ok: false, reason: event.reason || "foreground-window-unavailable" });
    }
    if (result.kind === "agent-state-write" && this.pendingAgentState?.requestId === event.requestId) {
      this.finishAgentState(event.ok ? { ok: true } : { ok: false, reason: event.reason || "agent-state-write-failed" }, event.requestId);
    }
    if (result.kind === "manual-calibration-write" && this.pendingManualCalibration?.bridgeRequestId === event.requestId && !event.ok) this.finishManualCalibration({ ok: false, reason: event.reason || "manual-calibration-write-failed" });
    if (result.kind === "manual-calibration-report" && this.pendingManualCalibration?.numericRequestId === event.calibration.requestId) {
      if (event.calibration.stage === "accepted") {
        this.pendingManualCalibration.onAccepted?.(event.calibration);
        this.emit("manual-calibration", { stage: "accepted", ...event.calibration });
      } else {
        const terminal = event.calibration;
        this.emit("manual-calibration", { stage: "terminal", ...terminal });
        this.finishManualCalibration(terminal.transportCode === 0 ? { ok: true, terminal } : { ok: false, reason: terminal.transport, terminal });
      }
    }
    if (["trigger", "cancel", "diagnostic"].includes(result.kind)) this.emit(result.kind, event);
  }

  async syncConfig(value) {
    if (this.pendingConfig) return Promise.resolve({ ok: false, reason: "config-sync-in-progress" });
    if (this.pendingRead) return Promise.resolve({ ok: false, reason: "config-read-in-progress" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected" });
    if (this.status.configCollectionWritable === false) return Promise.resolve({ ok: false, reason: "config-interface-unavailable" });
    if (!this.status.configCapabilities) {
      const checked = await this.readCapabilities();
      if (!checked.ok) return checked;
    }
    if (!this.status.configCapabilities?.config_write_v1) return { ok: false, reason: "config-write-v1-unsupported" };
    if (this.pendingConfig) return { ok: false, reason: "config-sync-in-progress" };
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

  async readConfig() {
    if (!this.status.configCapabilities) {
      const checked = await this.readCapabilities();
      if (!checked.ok) return checked;
    }
    if (!this.status.configCapabilities?.config_read_v1) return { ok: false, reason: "config-read-v1-unsupported" };
    return this.requestRead(2, "config");
  }

  readCapabilities() {
    return this.requestRead(0, "capabilities");
  }

  injectFixedText(requestId, { blockedProcessId = 0, blockedWindowHandles = [] } = {}) {
    if (this.pendingFixedText) return Promise.resolve({ ok: false, reason: "fixed-text-busy", bytes: 0 });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable", bytes: 0 });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected", bytes: 0 });
    if (!/^fixed-[a-zA-Z0-9-]{8,74}$/.test(String(requestId || "")) || !Number.isInteger(blockedProcessId) || blockedProcessId < 0 || blockedProcessId > 0xffffffff || !Array.isArray(blockedWindowHandles) || blockedWindowHandles.length > 4 || blockedWindowHandles.some((value) => !/^[0-9]{1,20}$/.test(String(value)))) return Promise.resolve({ ok: false, reason: "fixed-text-request-invalid", bytes: 0 });
    return new Promise((resolve) => {
      const timeout = this.setTimer(() => this.finishFixedText({ ok: false, reason: "fixed-text-injection-timeout", bytes: 0 }), 3000);
      this.pendingFixedText = { requestId, timeout, resolve };
      const command = { version: 1, type: "inject-fixed-text", requestId, expiresUnixMs: Date.now() + 3000, blockedProcessId, blockedWindowHandles: blockedWindowHandles.map(String) };
      this.child.stdin.write(`${JSON.stringify(command)}\n`, (error) => { if (error) this.finishFixedText({ ok: false, reason: "input-bridge-write-failed", bytes: 0 }); });
    });
  }

  pasteActiveWindow(targetWindow) {
    const target = String(targetWindow || "");
    if (!/^[1-9]\d{0,19}$/.test(target)) return Promise.resolve({ ok: false, reason: "target-window-invalid" });
    if (this.pendingPaste) return Promise.resolve({ ok: false, reason: "active-window-output-busy" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    const requestId = `paste-${randomUUID()}`;
    return new Promise((resolve) => {
      const timeout = this.setTimer(() => this.finishPaste({ ok: false, reason: "active-window-output-timeout" }), 3000);
      this.pendingPaste = { requestId, timeout, resolve };
      this.child.stdin.write(`${JSON.stringify({ version: 1, type: "paste-active-window", requestId, targetWindow: target })}\n`, (error) => { if (error) this.finishPaste({ ok: false, reason: "input-bridge-write-failed" }); });
    });
  }

  captureActiveWindow() {
    if (this.pendingCapture) return Promise.resolve({ ok: false, reason: "foreground-capture-busy" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    const requestId = `window-${randomUUID()}`;
    return new Promise((resolve) => {
      const timeout = this.setTimer(() => this.finishCapture({ ok: false, reason: "foreground-capture-timeout" }), 1000);
      this.pendingCapture = { requestId, timeout, resolve };
      this.child.stdin.write(`${JSON.stringify({ version: 1, type: "capture-active-window", requestId })}\n`, (error) => { if (error) this.finishCapture({ ok: false, reason: "input-bridge-write-failed" }); });
    });
  }

  sendAgentState(value) {
    const report = Buffer.isBuffer(value) ? Buffer.from(value) : value instanceof Uint8Array ? Buffer.from(value) : null;
    if (!report || report.length !== 64 || report[0] !== 0x12) return Promise.resolve({ ok: false, reason: "agent-state-report-invalid" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected" });
    if (this.status.configCollectionWritable === false) return Promise.resolve({ ok: false, reason: "config-interface-unavailable" });

    return new Promise((resolve) => {
      const entry = { requestId: `agent-${randomUUID()}`, report, resolve, timeout: null };
      if (this.pendingAgentState) {
        if (this.queuedAgentState) this.queuedAgentState.resolve({ ok: false, reason: "agent-state-superseded" });
        this.queuedAgentState = entry;
        return;
      }
      this.dispatchAgentState(entry);
    });
  }

  sendManualCalibration(value, { onAccepted } = {}) {
    let report; let decoded;
    try { report = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value); decoded = decodeManualCalibrationFeatureReport(report); }
    catch { return Promise.resolve({ ok: false, reason: "manual-calibration-report-invalid" }); }
    if (this.pendingManualCalibration) return Promise.resolve({ ok: false, reason: "manual-calibration-busy" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected" });
    if (this.status.calibrationCollectionWritable === false) return Promise.resolve({ ok: false, reason: "manual-calibration-interface-unavailable" });
    const bridgeRequestId = `motion-${randomUUID()}`;
    return new Promise((resolve) => {
      const timeout = this.setTimer(() => this.finishManualCalibration({ ok: false, reason: "manual-calibration-timeout" }), 2500);
      this.pendingManualCalibration = { bridgeRequestId, numericRequestId: decoded.requestId, confirmationId: decoded.confirmationId, timeout, resolve, onAccepted };
      this.child.stdin.write(`${JSON.stringify({ version: 1, type: "manual-calibration-request", requestId: bridgeRequestId, report: report.toString("base64") })}\n`, (error) => { if (error) this.finishManualCalibration({ ok: false, reason: "input-bridge-write-failed" }); });
    });
  }

  finishManualCalibration(result) {
    const pending = this.pendingManualCalibration;
    if (!pending) return;
    this.pendingManualCalibration = null;
    this.clearTimer(pending.timeout);
    pending.resolve(result);
  }

  dispatchAgentState(entry) {
    if (!this.child?.stdin?.writable || !this.status.boardConnected || this.status.configCollectionWritable === false) {
      entry.resolve({ ok: false, reason: !this.status.boardConnected ? "easyinput-not-connected" : this.status.configCollectionWritable === false ? "config-interface-unavailable" : "input-bridge-unavailable" });
      return;
    }
    entry.timeout = this.setTimer(() => this.finishAgentState({ ok: false, reason: "agent-state-write-timeout" }, entry.requestId), 1500);
    this.pendingAgentState = entry;
    const command = { version: 1, type: "set-agent-state", requestId: entry.requestId, report: entry.report.toString("base64") };
    this.child.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
      if (error) this.finishAgentState({ ok: false, reason: "input-bridge-write-failed" }, entry.requestId);
    });
  }

  finishAgentState(result, requestId = null) {
    const pending = this.pendingAgentState;
    if (!pending || (requestId && pending.requestId !== requestId)) return;
    this.pendingAgentState = null;
    this.clearTimer(pending.timeout);
    pending.resolve(result);
    const queued = this.queuedAgentState;
    this.queuedAgentState = null;
    if (!queued) return;
    if (!this.child?.stdin?.writable || !this.status.boardConnected || this.status.configCollectionWritable === false) queued.resolve({ ok: false, reason: !this.status.boardConnected ? "easyinput-disconnected" : "config-interface-unavailable" });
    else this.dispatchAgentState(queued);
  }

  failAllAgentStates(reason) {
    const pending = this.pendingAgentState;
    const queued = this.queuedAgentState;
    this.pendingAgentState = null;
    this.queuedAgentState = null;
    if (pending) {
      this.clearTimer(pending.timeout);
      pending.resolve({ ok: false, reason });
    }
    if (queued) queued.resolve({ ok: false, reason });
  }

  requestRead(flag, mode) {
    if (this.pendingRead) return Promise.resolve({ ok: false, reason: "config-read-in-progress" });
    if (this.pendingConfig) return Promise.resolve({ ok: false, reason: "config-sync-in-progress" });
    if (!this.child?.stdin?.writable) return Promise.resolve({ ok: false, reason: "input-bridge-unavailable" });
    if (!this.status.boardConnected) return Promise.resolve({ ok: false, reason: "easyinput-not-connected" });
    if (this.status.configCollectionWritable === false) return Promise.resolve({ ok: false, reason: "config-interface-unavailable" });
    const requestId = `read-${randomUUID()}`;
    return new Promise((resolve) => {
      this.pendingRead = { requestId, timeout: null, resolve, mode };
      this.refreshReadTimeout();
      const numericId = (Date.now() >>> 0) || 1;
      this.pendingRead.numericId = numericId;
      const report = encodeConfigReadRequest(numericId, flag);
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

  finishFixedText(result) {
    const pending = this.pendingFixedText;
    if (!pending) return;
    this.pendingFixedText = null;
    this.clearTimer(pending.timeout);
    pending.resolve(result);
  }

  finishPaste(result) {
    const pending = this.pendingPaste;
    if (!pending) return;
    this.pendingPaste = null;
    this.clearTimer(pending.timeout);
    pending.resolve(result);
  }

  finishCapture(result) {
    const pending = this.pendingCapture;
    if (!pending) return;
    this.pendingCapture = null;
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
    this.finishFixedText({ ok: false, reason: "input-bridge-exited", bytes: 0 });
    this.finishPaste({ ok: false, reason: "input-bridge-exited" });
    this.finishCapture({ ok: false, reason: "input-bridge-exited" });
    this.failAllAgentStates("input-bridge-exited");
    this.finishManualCalibration({ ok: false, reason: "input-bridge-exited" });
    this.filter.reset();
    this.status = { ...this.status, process: this.stopping ? "stopped" : "restarting", boardConnected: false, configCollectionWritable: false, calibrationCollectionWritable: false, configCapabilities: null, linkDiagnostics: null, error: error?.message || "" };
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
    this.finishFixedText({ ok: false, reason: "input-bridge-stopped", bytes: 0 });
    this.finishPaste({ ok: false, reason: "input-bridge-stopped" });
    this.finishCapture({ ok: false, reason: "input-bridge-stopped" });
    this.failAllAgentStates("input-bridge-stopped");
    this.finishManualCalibration({ ok: false, reason: "input-bridge-stopped" });
    child?.kill?.();
    this.filter.reset();
    this.status = { ...this.status, process: "stopped", boardConnected: false, configCollectionWritable: false, calibrationCollectionWritable: false, configCapabilities: null, linkDiagnostics: null };
    this.emit("status", this.snapshot());
  }
}

module.exports = { InputBridgeManager };
