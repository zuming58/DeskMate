"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { opaqueCodexTaskKey, normalizeTaskLabel } = require("./codex-hook-state.cjs");

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_REFRESH_MS = 30000;
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;

function safeReason(value, fallback = "codex-app-server-unavailable") {
  const reason = String(value || "");
  return /^[a-z0-9-]{1,80}$/.test(reason) ? reason : fallback;
}

function resolveCodexExecutable({ env = process.env, platform = process.platform, fileSystem = fs } = {}) {
  const configured = typeof env.CODEX_CLI_PATH === "string" ? env.CODEX_CLI_PATH.trim() : "";
  if (configured && path.isAbsolute(configured) && fileSystem.existsSync(configured)) return configured;
  const executable = platform === "win32" ? "codex.exe" : "codex";
  for (const directory of String(env.PATH || "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, executable);
    try { if (fileSystem.statSync(candidate).isFile()) return candidate; } catch { /* continue */ }
  }
  return executable;
}

function fallbackLabelFromCwd(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 2048) return "";
  return normalizeTaskLabel(path.basename(value));
}

function parseThreadCatalog(result = {}) {
  const entries = new Map();
  for (const thread of Array.isArray(result?.data) ? result.data.slice(0, 200) : []) {
    const taskKey = opaqueCodexTaskKey(thread?.id);
    if (!taskKey) continue;
    const label = normalizeTaskLabel(thread?.name) || fallbackLabelFromCwd(thread?.cwd);
    if (!label) continue;
    entries.set(taskKey, label);
  }
  return entries;
}

function listCodexThreadCatalog({ spawnImpl = spawn, command = resolveCodexExecutable(), timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let stdout = "";
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child?.kill?.(); } catch { /* best effort */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "codex-app-server-timeout", entries: new Map() }), Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    try {
      child = spawnImpl(command, ["app-server"], { env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      finish({ ok: false, reason: "codex-app-server-start-failed", entries: new Map() });
      return;
    }
    const send = (value) => {
      try { child.stdin.write(`${JSON.stringify(value)}\n`); return true; }
      catch { finish({ ok: false, reason: "codex-app-server-write-failed", entries: new Map() }); return false; }
    };
    child.once("error", () => finish({ ok: false, reason: "codex-app-server-start-failed", entries: new Map() }));
    child.once("exit", () => { if (!settled) finish({ ok: false, reason: "codex-app-server-exited", entries: new Map() }); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) return finish({ ok: false, reason: "codex-app-server-output-too-large", entries: new Map() });
      let newline;
      while ((newline = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && message.result) {
          send({ method: "initialized", params: {} });
          send({ method: "thread/list", id: 2, params: { cursor: null, limit: 100, sortKey: "updated_at", sortDirection: "desc", archived: false } });
        } else if (message.id === 1 && message.error) finish({ ok: false, reason: "codex-app-server-initialize-failed", entries: new Map() });
        else if (message.id === 2 && message.result) finish({ ok: true, reason: "", entries: parseThreadCatalog(message.result) });
        else if (message.id === 2 && message.error) finish({ ok: false, reason: "codex-app-server-list-failed", entries: new Map() });
      }
    });
    send({ method: "initialize", id: 1, params: { clientInfo: { name: "deskmate", title: "DeskMate", version: "1.0.0" }, capabilities: { experimentalApi: false } } });
  });
}

class CodexTaskCatalog {
  constructor({ list = listCodexThreadCatalog, now = () => Date.now(), refreshMs = DEFAULT_REFRESH_MS } = {}) {
    this.listCatalog = list;
    this.now = now;
    this.refreshMs = Math.max(5000, Number(refreshMs) || DEFAULT_REFRESH_MS);
    this.entries = new Map();
    this.lastRefreshAt = 0;
    this.refreshing = null;
    this.reason = "codex-app-server-not-checked";
  }

  labelFor(taskKey) { return this.entries.get(String(taskKey || "")) || ""; }

  status() {
    return Object.freeze({ available: this.lastRefreshAt > 0 && !this.reason, count: this.entries.size, lastRefreshAt: this.lastRefreshAt ? new Date(this.lastRefreshAt).toISOString() : "", reason: safeReason(this.reason, "") });
  }

  refresh({ force = false } = {}) {
    if (this.refreshing) return this.refreshing;
    if (!force && this.lastRefreshAt && this.now() - this.lastRefreshAt < this.refreshMs) return Promise.resolve({ ok: !this.reason, entries: new Map(this.entries), status: this.status() });
    this.refreshing = Promise.resolve().then(() => this.listCatalog()).then((result) => {
      if (result?.ok && result.entries instanceof Map) {
        this.entries = new Map(result.entries);
        this.lastRefreshAt = this.now();
        this.reason = "";
        return { ok: true, entries: new Map(this.entries), status: this.status() };
      }
      this.lastRefreshAt = this.now();
      this.reason = safeReason(result?.reason);
      return { ok: false, reason: this.reason, entries: new Map(this.entries), status: this.status() };
    }).catch(() => {
      this.lastRefreshAt = this.now();
      this.reason = "codex-app-server-unavailable";
      return { ok: false, reason: this.reason, entries: new Map(this.entries), status: this.status() };
    }).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
}

module.exports = { CodexTaskCatalog, DEFAULT_REFRESH_MS, DEFAULT_TIMEOUT_MS, fallbackLabelFromCwd, listCodexThreadCatalog, parseThreadCatalog, resolveCodexExecutable };
