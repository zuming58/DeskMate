const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const readline = require("readline");
const { parseBridgeLine, InputTriggerFilter } = require("./input-bridge-protocol.cjs");

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
    this.status = { available: false, process: "stopped", boardConnected: false, restarts: 0, error: "" };
  }

  configure(value) { return this.filter.configure(value); }

  snapshot() { return { ...this.status, config: { ...this.filter.config } }; }

  start() {
    if (this.child || this.stopping) return this.snapshot();
    try {
      const child = this.spawnImpl(this.executable, [], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
    if (["trigger", "cancel", "diagnostic"].includes(result.kind)) this.emit(result.kind, event);
  }

  handleExit(error) {
    if (!this.child && this.stopping) return;
    this.child = null;
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
    child?.kill?.();
    this.filter.reset();
    this.status = { ...this.status, process: "stopped", boardConnected: false };
    this.emit("status", this.snapshot());
  }
}

module.exports = { InputBridgeManager };
