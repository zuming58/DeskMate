const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALLOWED_EXTENSIONS = new Set([".exe", ".lnk"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCAL_DRIVE_PATTERN = /^[a-zA-Z]:[\\/]/;

function safeLabel(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
}

async function walkShortcuts(root, results, limit = 400) {
  if (!root || results.length >= limit) return;
  let entries;
  try { entries = await fs.promises.readdir(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (results.length >= limit) return;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await walkShortcuts(fullPath, results, limit);
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".lnk" && path.basename(entry.name, ".lnk").trim()) results.push(fullPath);
  }
}

class AppActionStore {
  constructor({ userDataPath, dialog, shell } = {}) {
    this.filePath = path.join(userDataPath, "app-actions.json");
    this.dialog = dialog;
    this.shell = shell;
    this.actions = new Map();
    this.discovered = new Map();
    this.load();
  }

  load() {
    let value = {};
    try { value = JSON.parse(fs.readFileSync(this.filePath, "utf8")); } catch { value = {}; }
    for (const [id, item] of Object.entries(value)) {
      if (UUID_PATTERN.test(id) && this.isAllowedTarget(item?.target)) this.actions.set(id, { target: path.resolve(item.target), label: safeLabel(item.label) || path.basename(item.target, path.extname(item.target)), voiceEnabled: item.voiceEnabled === true });
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const value = Object.fromEntries(this.actions);
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  isAllowedTarget(target) {
    if (typeof target !== "string" || !LOCAL_DRIVE_PATTERN.test(target) || !path.win32.isAbsolute(target)) return false;
    if (target.startsWith("\\\\") || target.startsWith("\\\\?\\") || target.startsWith("\\\\.\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) return false;
    return ALLOWED_EXTENSIONS.has(path.win32.extname(target).toLowerCase());
  }

  async discover() {
    const targets = [];
    await walkShortcuts(path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"), targets);
    await walkShortcuts(path.join(process.env.PROGRAMDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"), targets);
    this.discovered.clear();
    const seen = new Set();
    const apps = [];
    for (const target of targets) {
      const label = safeLabel(path.basename(target, path.extname(target)));
      const dedupe = label.toLocaleLowerCase("zh-CN");
      if (!label || seen.has(dedupe)) continue;
      seen.add(dedupe);
      const token = crypto.createHash("sha256").update(target).digest("hex").slice(0, 24);
      this.discovered.set(token, target);
      apps.push({ token, label, source: "start-menu" });
    }
    return apps.sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }

  registerTarget(target, label) {
    if (!this.isAllowedTarget(target)) throw new Error("只允许选择 Windows 应用或快捷方式");
    const resolved = path.resolve(target);
    for (const [id, item] of this.actions) if (item.target.toLocaleLowerCase() === resolved.toLocaleLowerCase()) return { id, label: item.label, voiceEnabled: item.voiceEnabled === true };
    const id = crypto.randomUUID().toLowerCase();
    const item = { target: resolved, label: safeLabel(label) || path.basename(resolved, path.extname(resolved)), voiceEnabled: false };
    this.actions.set(id, item);
    this.save();
    return { id, label: item.label, voiceEnabled: false };
  }

  registerDiscovered(token) {
    const target = this.discovered.get(String(token || ""));
    if (!target) throw new Error("应用列表已过期，请重新搜索");
    return this.registerTarget(target, path.basename(target, path.extname(target)));
  }

  describe(id) {
    const value = String(id || "");
    if (!UUID_PATTERN.test(value)) return null;
    const item = this.actions.get(value);
    return item ? { id: value, label: item.label, voiceEnabled: item.voiceEnabled === true } : null;
  }

  listRegistered({ limit = 100 } = {}) {
    return [...this.actions.entries()].slice(0, Math.max(1, Math.min(200, Number(limit) || 100))).map(([id, item]) => ({ id, label: item.label, voiceEnabled: item.voiceEnabled === true }));
  }

  setVoiceEnabled(id, enabled) {
    const value = String(id || "");
    if (!UUID_PATTERN.test(value) || typeof enabled !== "boolean") return { ok: false, reason: "application-voice-policy-invalid" };
    const item = this.actions.get(value);
    if (!item) return { ok: false, reason: "host-action-not-mapped" };
    item.voiceEnabled = enabled;
    this.save();
    return { ok: true, ...this.describe(value) };
  }

  async choose(parentWindow) {
    const result = await this.dialog.showOpenDialog(parentWindow, {
      title: "选择要打开的应用",
      properties: ["openFile"],
      filters: [{ name: "Windows 应用", extensions: ["exe", "lnk"] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { cancelled: true };
    return this.registerTarget(result.filePaths[0]);
  }

  async execute(id) {
    const item = this.actions.get(String(id || ""));
    if (!item) return { ok: false, reason: "host-action-not-mapped" };
    if (!this.isAllowedTarget(item.target) || !fs.existsSync(item.target)) return { ok: false, reason: "application-missing", label: item.label };
    let launchTarget = item.target;
    if (path.win32.extname(item.target).toLowerCase() === ".lnk") {
      if (typeof this.shell.readShortcutLink !== "function") return { ok: false, reason: "shortcut-target-unverified", label: item.label };
      let shortcut;
      try { shortcut = this.shell.readShortcutLink(item.target); } catch { return { ok: false, reason: "shortcut-target-unverified", label: item.label }; }
      if (!shortcut || String(shortcut.args || "").trim() || !this.isAllowedTarget(shortcut.target) || path.win32.extname(shortcut.target).toLowerCase() !== ".exe" || !fs.existsSync(shortcut.target)) return { ok: false, reason: "shortcut-target-unverified", label: item.label };
      launchTarget = shortcut.target;
    }
    const error = await this.shell.openPath(launchTarget);
    return error ? { ok: false, reason: "application-open-failed", label: item.label } : { ok: true, label: item.label };
  }

  async executeVoice(id) {
    const item = this.actions.get(String(id || ""));
    if (!item) return { ok: false, reason: "host-action-not-mapped" };
    if (item.voiceEnabled !== true) return { ok: false, reason: "application-voice-not-enabled", label: item.label };
    return this.execute(id);
  }
}

class HostActionExecutor {
  constructor({ store, reservedActions = new Map(), now = () => Date.now(), duplicateWindowMs = 250 } = {}) {
    this.store = store;
    this.now = now;
    this.duplicateWindowMs = duplicateWindowMs;
    this.reservedActions = reservedActions;
    this.lastById = new Map();
    this.tail = Promise.resolve();
  }

  execute(id) {
    const value = String(id || "");
    if (!UUID_PATTERN.test(value)) return Promise.resolve({ ok: false, reason: "host-action-invalid" });
    const timestamp = this.now();
    const previous = this.lastById.get(value);
    if (previous !== undefined && timestamp - previous < this.duplicateWindowMs) return Promise.resolve({ ok: false, reason: "host-action-duplicate" });
    this.lastById.set(value, timestamp);
    const handler = this.reservedActions.get(value);
    const operation = this.tail.then(() => typeof handler === "function" ? handler() : this.store.execute(value));
    this.tail = operation.catch(() => {});
    return operation;
  }
}

module.exports = { AppActionStore, HostActionExecutor, safeLabel };
