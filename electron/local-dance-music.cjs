const fs = require("fs");
const path = require("path");

const MAX_TRACK_BYTES = 32 * 1024 * 1024;
const MIME_TYPES = Object.freeze({
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
});

function safeLabel(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
}

function safeReason(value) {
  return /^[a-z0-9-]{1,80}$/.test(String(value || "")) ? String(value) : "dance-music-failed";
}

class LocalDanceMusicStore {
  constructor({ userDataPath, dialog, safeStorage, fsImpl = fs, maxTrackBytes = MAX_TRACK_BYTES } = {}) {
    this.filePath = path.join(userDataPath, "local-dance-music.json");
    this.dialog = dialog;
    this.safeStorage = safeStorage;
    this.fs = fsImpl;
    this.maxTrackBytes = maxTrackBytes;
    this.settings = { version: 1, enabled: false, encryptedPath: "", label: "" };
    this.playback = { state: "idle", requestId: "", reason: "" };
    this.load();
  }

  encryptionAvailable() {
    return this.safeStorage?.isEncryptionAvailable?.() === true;
  }

  load() {
    let value = {};
    try { value = JSON.parse(this.fs.readFileSync(this.filePath, "utf8")); } catch { value = {}; }
    this.settings = {
      version: 1,
      enabled: value.enabled === true,
      encryptedPath: typeof value.encryptedPath === "string" ? value.encryptedPath : "",
      label: safeLabel(value.label),
    };
  }

  save() {
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    this.fs.writeFileSync(temporary, JSON.stringify(this.settings, null, 2), { encoding: "utf8", mode: 0o600 });
    this.fs.renameSync(temporary, this.filePath);
  }

  decryptPath() {
    if (!this.settings.encryptedPath || !this.encryptionAvailable()) return "";
    try { return this.safeStorage.decryptString(Buffer.from(this.settings.encryptedPath, "base64")); }
    catch { return ""; }
  }

  validateTrack(target) {
    const extension = path.extname(String(target || "")).toLowerCase();
    if (!MIME_TYPES[extension]) return { ok: false, reason: "dance-music-format-unsupported" };
    let stat;
    try { stat = this.fs.statSync(target); } catch { return { ok: false, reason: "dance-music-file-missing" }; }
    if (!stat.isFile()) return { ok: false, reason: "dance-music-file-missing" };
    if (stat.size <= 0 || stat.size > this.maxTrackBytes) return { ok: false, reason: "dance-music-file-too-large" };
    return { ok: true, extension, mimeType: MIME_TYPES[extension], bytes: stat.size };
  }

  status() {
    const target = this.decryptPath();
    const validation = target ? this.validateTrack(target) : { ok: false, reason: this.settings.encryptedPath ? "dance-music-path-unavailable" : "dance-music-not-selected" };
    return {
      configured: validation.ok === true,
      enabled: validation.ok === true && this.settings.enabled === true,
      label: validation.ok ? this.settings.label || safeLabel(path.basename(target, path.extname(target))) : "",
      storage: this.encryptionAvailable() ? "encrypted" : "unavailable",
      state: this.playback.state,
      reason: validation.ok ? this.playback.reason : safeReason(validation.reason),
    };
  }

  async choose(parentWindow) {
    if (!this.encryptionAvailable()) return { ok: false, reason: "secure-storage-unavailable", ...this.status() };
    const result = await this.dialog.showOpenDialog(parentWindow, {
      title: "选择跳舞时播放的本地音乐",
      properties: ["openFile"],
      filters: [{ name: "音频文件", extensions: Object.keys(MIME_TYPES).map((item) => item.slice(1)) }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true, ...this.status() };
    const target = result.filePaths[0];
    const validation = this.validateTrack(target);
    if (!validation.ok) return { ok: false, reason: validation.reason, ...this.status() };
    this.settings = {
      version: 1,
      enabled: true,
      encryptedPath: this.safeStorage.encryptString(target).toString("base64"),
      label: safeLabel(path.basename(target, path.extname(target))),
    };
    this.save();
    return { ok: true, ...this.status() };
  }

  setEnabled(enabled) {
    if (typeof enabled !== "boolean") return { ok: false, reason: "dance-music-policy-invalid", ...this.status() };
    const current = this.status();
    if (enabled && !current.configured) return { ok: false, reason: current.reason || "dance-music-not-selected", ...current };
    this.settings.enabled = enabled;
    this.save();
    return { ok: true, ...this.status() };
  }

  readTrack() {
    const target = this.decryptPath();
    const validation = target ? this.validateTrack(target) : { ok: false, reason: "dance-music-not-selected" };
    if (!validation.ok) return { ok: false, reason: validation.reason };
    try {
      return { ok: true, label: this.settings.label || safeLabel(path.basename(target, path.extname(target))), mimeType: validation.mimeType, data: this.fs.readFileSync(target) };
    } catch {
      return { ok: false, reason: "dance-music-read-failed" };
    }
  }

  notePlayback({ state, requestId = "", reason = "" } = {}) {
    const nextState = ["idle", "starting", "playing", "error"].includes(state) ? state : "error";
    this.playback = { state: nextState, requestId: String(requestId || "").slice(0, 80), reason: reason ? safeReason(reason) : "" };
    return this.status();
  }
}

module.exports = { LocalDanceMusicStore, MAX_TRACK_BYTES, MIME_TYPES };
