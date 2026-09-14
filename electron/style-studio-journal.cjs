const fs = require("fs");
const path = require("path");

const STATES = new Set(["running", "succeeded", "failed", "cancelled", "uncertain"]);
const safeText = (value, max = 160) => String(value || "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, max);

class StyleStudioJournal {
  constructor({ userDataPath, fsImpl = fs, now = () => new Date() }) {
    this.fs = fsImpl;
    this.now = now;
    this.root = path.join(userDataPath, "style-studio");
    this.file = path.join(this.root, "generation-journal.json");
  }
  _read() {
    try {
      const value = JSON.parse(this.fs.readFileSync(this.file, "utf8"));
      return value?.version === 1 && Array.isArray(value.items) ? value.items.slice(-20) : [];
    } catch { return []; }
  }
  _write(items) {
    this.fs.mkdirSync(this.root, { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    this.fs.writeFileSync(temporary, JSON.stringify({ version: 1, items: items.slice(-20) }), { encoding: "utf8", mode: 0o600 });
    this.fs.renameSync(temporary, this.file);
  }
  start({ id, styleId, provider, model }) {
    const startedAt = this.now().toISOString();
    const item = { id: safeText(id, 80), styleId: safeText(styleId, 40), provider: safeText(provider, 40), model: safeText(model, 80), state: "running", startedAt };
    this._write([...this._read().filter(entry => entry.id !== item.id), item]);
    return item;
  }
  finish(id, state, detail = {}) {
    const items = this._read();
    const index = items.findIndex(item => item.id === safeText(id, 80));
    if (index < 0 || !STATES.has(state)) return null;
    const endedAt = this.now().toISOString();
    const started = Date.parse(items[index].startedAt);
    items[index] = {
      ...items[index], state, endedAt,
      elapsedMs: Number.isFinite(started) ? Math.max(0, Date.parse(endedAt) - started) : 0,
      ...(detail.providerRequestId ? { providerRequestId: safeText(detail.providerRequestId) } : {}),
      ...(detail.failureClass ? { failureClass: safeText(detail.failureClass, 80) } : {}),
    };
    this._write(items);
    return items[index];
  }
  latest() { return this._read().at(-1) || null; }
}

module.exports = { StyleStudioJournal };

