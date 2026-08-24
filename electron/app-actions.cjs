const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALLOWED_EXTENSIONS = new Set([".exe", ".lnk"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
      if (UUID_PATTERN.test(id) && this.isAllowedTarget(item?.target)) this.actions.set(id, { target: path.resolve(item.target), label: safeLabel(item.label) || path.basename(item.target, path.extname(item.target)) });
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
    return typeof target === "string" && path.isAbsolute(target) && ALLOWED_EXTENSIONS.has(path.extname(target).toLowerCase());
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
    for (const [id, item] of this.actions) if (item.target.toLocaleLowerCase() === resolved.toLocaleLowerCase()) return { id, label: item.label };
    const id = crypto.randomUUID().toLowerCase();
    const item = { target: resolved, label: safeLabel(label) || path.basename(resolved, path.extname(resolved)) };
    this.actions.set(id, item);
    this.save();
    return { id, label: item.label };
  }

  registerDiscovered(token) {
    const target = this.discovered.get(String(token || ""));
    if (!target) throw new Error("应用列表已过期，请重新搜索");
    return this.registerTarget(target, path.basename(target, path.extname(target)));
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
    if (!fs.existsSync(item.target)) return { ok: false, reason: "application-missing", label: item.label };
    const error = await this.shell.openPath(item.target);
    return error ? { ok: false, reason: "application-open-failed", label: item.label } : { ok: true, label: item.label };
  }
}

module.exports = { AppActionStore, safeLabel };
