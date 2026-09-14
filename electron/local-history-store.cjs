const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const MAX_AUDIO = 64 * 1024 * 1024;
const hash = (value) => createHash("sha256").update(value).digest("hex");
function fail(code) { throw new Error(`local-history-${code}`); }
function idOf(value) {
  const id = String(value ?? "");
  if (!id || id.length > 200 || /[\x00-\x1f]/.test(id)) fail("invalid-id");
  return id;
}
function timestamp(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const result = Date.parse(value); if (Number.isFinite(result) && result > 0) return result;
  }
  return null;
}
function validateRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.text !== "string" || typeof value.time !== "string") fail("invalid-record");
  idOf(value.id);
  if (value.audioId != null) idOf(value.audioId);
  if (value.rawText != null && typeof value.rawText !== "string") fail("invalid-record");
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 1024 * 1024) fail("record-too-large");
  return json;
}

// Owned exclusively by the local-history worker. Never used on the audio/output thread.
class LocalHistoryStore {
  constructor({ userDataPath }) {
    this.userDataPath = userDataPath;
    fs.mkdirSync(userDataPath, { recursive: true });
    this.root = path.join(userDataPath, "voice-recordings");
    fs.mkdirSync(this.root, { recursive: true });
    this.db = new DatabaseSync(path.join(userDataPath, "voice-history.sqlite3"));
    try {
      if (this.db.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail("database-corrupt");
      const version = this.db.prepare("PRAGMA user_version").get().user_version;
      if (version > 1) fail("newer-schema");
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY, payload TEXT NOT NULL, digest TEXT NOT NULL, created_at INTEGER, date_source TEXT NOT NULL, memory_event_id TEXT, audio_id TEXT);
        CREATE TABLE IF NOT EXISTS audio(id TEXT PRIMARY KEY, digest TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, created_at INTEGER);
        CREATE TABLE IF NOT EXISTS staged_history(id TEXT PRIMARY KEY, payload TEXT NOT NULL, digest TEXT NOT NULL, memory_at INTEGER);
        CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        PRAGMA user_version=1;`);
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  status() {
    let retention = { audioDays: 7, textDays: 20, enabled: false };
    try {
      const policy = JSON.parse(fs.readFileSync(path.join(this.userDataPath, "companion-memory-policy.json"), "utf8"));
      const state = JSON.parse(fs.readFileSync(path.join(this.userDataPath, "retention-state.json"), "utf8"));
      retention = { audioDays: Number(policy.audioRetentionDays) || 7, textDays: Number(policy.rawRetentionDays) || 20, enabled: state.enabled === true };
    } catch { /* First launch keeps consent disabled and the safe defaults visible. */ }
    return { ok: true, schema: 1, storage: "sqlite-managed", migrated: this.db.prepare("SELECT value FROM metadata WHERE key='legacy-complete'").get()?.value === "1", records: this.db.prepare("SELECT count(*) AS n FROM history").get().n, maxSequence: this.db.prepare("SELECT coalesce(max(rowid),0) AS n FROM history").get().n, recordings: this.db.prepare("SELECT count(*) AS n FROM audio").get().n, staged: this.db.prepare("SELECT count(*) AS n FROM staged_history").get().n, retention };
  }
  audioFile(digest) {
    if (!/^[a-f0-9]{64}$/.test(digest)) fail("invalid-digest");
    return path.join(this.root, `${digest}.audio`);
  }
  putAudio({ id, bytes, mime = "audio/webm", createdAt = null }) {
    id = idOf(id);
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) fail("invalid-audio");
    const buffer = Buffer.from(bytes);
    if (!buffer.length || buffer.length > MAX_AUDIO) fail("audio-size");
    if (typeof mime !== "string" || mime.length > 100 || !/^audio\/[a-z0-9.+;-]+(?:[ =a-z0-9.+;-]*)$/i.test(mime)) fail("audio-mime");
    const digest = hash(buffer), file = this.audioFile(digest);
    const existing = this.db.prepare("SELECT * FROM audio WHERE id=?").get(id);
    if (existing && (existing.digest !== digest || existing.size !== buffer.length || existing.mime !== mime)) fail("audio-conflict");
    if (!fs.existsSync(file)) {
      // Fixed content-addressed names; no renderer-controlled path. Crash residue is safe to retry.
      const pending = `${file}.pending`;
      const fd = fs.openSync(pending, "w");
      try { fs.writeFileSync(fd, buffer); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      if (hash(fs.readFileSync(pending)) !== digest) fail("audio-integrity");
      fs.renameSync(pending, file);
    }
    if (hash(fs.readFileSync(file)) !== digest) fail("audio-integrity");
    this.db.prepare("INSERT OR IGNORE INTO audio VALUES(?,?,?,?,?)").run(id, digest, buffer.length, mime, timestamp(createdAt));
    return { ok: true, id, digest, size: buffer.length };
  }
  readAudio(id) {
    const item = this.db.prepare("SELECT * FROM audio WHERE id=?").get(idOf(id));
    if (!item) return null;
    const bytes = fs.readFileSync(this.audioFile(item.digest));
    if (bytes.length !== item.size || hash(bytes) !== item.digest) fail("audio-integrity");
    return { bytes: new Uint8Array(bytes), mime: item.mime, createdAt: item.created_at };
  }
  append(record, memoryAt = null) {
    const payload = validateRecord(record), id = idOf(record.id), digest = hash(payload);
    const existing = this.db.prepare("SELECT digest FROM history WHERE id=?").get(id);
    if (existing) { if (existing.digest !== digest) fail("record-conflict"); return { ok: true, duplicate: true }; }
    const audio = record.audioId != null ? this.db.prepare("SELECT created_at FROM audio WHERE id=?").get(idOf(record.audioId)) : null;
    if (record.audioId != null && !audio) fail("audio-missing");
    const explicit = timestamp(record.createdAt), audioAt = timestamp(audio?.created_at), linkedAt = timestamp(memoryAt);
    const at = explicit || audioAt || linkedAt;
    const source = explicit ? "record" : audioAt ? "recording" : linkedAt ? "memory" : "unknown";
    this.db.prepare("INSERT INTO history VALUES(?,?,?,?,?,?,?)").run(id, payload, digest, at, source, typeof record.memoryEventId === "string" ? record.memoryEventId.slice(0, 256) : linkedAt ? `dictation:${id}` : null, record.audioId == null ? null : idOf(record.audioId));
    return { ok: true };
  }
  list({ offset = 0, limit = 200, maxSequence = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(maxSequence) || maxSequence < 0) fail("invalid-page");
    return this.db.prepare("SELECT * FROM history WHERE rowid<=? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?").all(maxSequence, limit, offset).map((row) => {
      if (hash(row.payload) !== row.digest) fail("record-integrity");
      const record = JSON.parse(row.payload);
      return { ...record, createdAt: row.created_at == null ? null : new Date(row.created_at).toISOString(), dateSource: row.date_source, date: row.created_at == null ? "日期未知" : record.date, memoryEventId: row.memory_event_id };
    });
  }
  stage({ records }) {
    if (!Array.isArray(records) || records.length > 50) fail("invalid-batch");
    if (this.status().migrated) fail("already-migrated");
    return this.transaction(() => {
      for (const item of records) {
        const payload = validateRecord(item.record), id = idOf(item.record.id), digest = hash(payload);
        const existing = this.db.prepare("SELECT digest FROM staged_history WHERE id=?").get(id);
        if (existing && existing.digest !== digest) fail("migration-conflict");
        this.db.prepare("INSERT OR IGNORE INTO staged_history VALUES(?,?,?,?)").run(id, payload, digest, timestamp(item.memoryAt));
      }
      return { ok: true };
    });
  }
  finish({ manifest, audioManifest }) {
    if (!Array.isArray(manifest) || manifest.length > 100000 || !Array.isArray(audioManifest) || audioManifest.length > 100000) fail("invalid-manifest");
    if (this.status().migrated) return this.status();
    const rows = this.db.prepare("SELECT * FROM staged_history ORDER BY rowid").all();
    const expected = new Map(manifest.map((item) => [idOf(item.id), item.digest]));
    if (expected.size !== manifest.length || rows.length !== expected.size || rows.some((row) => expected.get(row.id) !== row.digest || hash(row.payload) !== row.digest)) fail("migration-integrity");
    const audioIds = new Set();
    for (const item of audioManifest) {
      const id = idOf(item.id); if (audioIds.has(id)) fail("invalid-manifest"); audioIds.add(id);
      const audio = this.readAudio(id);
      if (!audio || hash(audio.bytes) !== item.digest || audio.bytes.length !== item.size) fail("audio-integrity");
    }
    for (const row of rows) {
      const record = JSON.parse(row.payload);
      if (record.audioId != null && !audioIds.has(idOf(record.audioId))) fail("audio-missing");
    }
    this.transaction(() => {
      for (const row of rows) this.append(JSON.parse(row.payload), row.memory_at);
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('legacy-complete','1')").run();
      this.db.exec("DELETE FROM staged_history");
    });
    return this.status();
  }
  remove({ ids }) {
    if (!Array.isArray(ids) || ids.length > 100000) fail("invalid-ids");
    // File reclamation is a later journaled retention slice. Explicit history removal
    // currently removes only referenced metadata; immutable files stay recoverable.
    return this.transaction(() => {
      let removed = 0;
      for (const id of new Set(ids.map(idOf))) removed += this.db.prepare("DELETE FROM history WHERE id=?").run(id).changes;
      return { ok: true, removed };
    });
  }
  close() { this.db.close(); }
}
module.exports = { LocalHistoryStore, hash, timestamp };
