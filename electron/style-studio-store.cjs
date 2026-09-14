const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SOURCE_LIMIT = 10 * 1024 * 1024;
const RESULT_LIMIT = 25 * 1024 * 1024;
const MAX_SOURCES = 8;
const MAX_RESULTS = 24;
const MAX_PIXELS = 40_000_000;
const MIME_EXT = Object.freeze({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" });

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(value || []);
}

function sniffImage(bytes) {
  const data = asBuffer(bytes);
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mime: "image/png", width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length >= 12 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
      const length = data.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mime: "image/jpeg", width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
    throw new Error("style-studio-image-invalid");
  }
  if (data.length >= 30 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    const kind = data.toString("ascii", 12, 16);
    if (kind === "VP8X") return { mime: "image/webp", width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
    if (kind === "VP8 " && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) return { mime: "image/webp", width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L" && data[20] === 0x2f) return { mime: "image/webp", width: 1 + ((data[21] | data[22] << 8) & 0x3fff), height: 1 + (((data[22] >> 6) | data[23] << 2 | data[24] << 10) & 0x3fff) };
    throw new Error("style-studio-image-invalid");
  }
  throw new Error("style-studio-image-invalid");
}

function validateImage(bytes, expectedMime, limit) {
  const data = asBuffer(bytes);
  if (!data.length) throw new Error("style-studio-image-empty");
  if (data.length > limit) throw new Error("style-studio-image-too-large");
  const inspected = sniffImage(data);
  if (expectedMime && inspected.mime !== expectedMime) throw new Error("style-studio-image-type-mismatch");
  if (inspected.width && inspected.height && inspected.width * inspected.height > MAX_PIXELS) throw new Error("style-studio-image-pixels-too-large");
  return { data, ...inspected };
}

function publicRecord(item) {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    mime: item.mime,
    size: item.size,
    width: item.width || 0,
    height: item.height || 0,
    createdAt: item.createdAt,
    ...(item.sourceId ? { sourceId: item.sourceId } : {}),
    ...(item.styleId ? { styleId: item.styleId, styleName: item.styleName, strength: item.strength, brief: item.brief || "" } : {}),
  };
}

class StyleStudioStore {
  constructor({ userDataPath, fsImpl = fs, now = () => new Date(), randomId = () => crypto.randomUUID() }) {
    this.fs = fsImpl;
    this.now = now;
    this.randomId = randomId;
    this.root = path.join(userDataPath, "style-studio");
    this.assetRoot = path.join(this.root, "assets");
    this.indexPath = path.join(this.root, "library.json");
  }

  _readIndex() {
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.indexPath, "utf8"));
      if (parsed?.version !== 1 || !Number.isInteger(parsed.revision) || !Array.isArray(parsed.items) || parsed.items.length > MAX_SOURCES + MAX_RESULTS || parsed.items.some(item => !item || !["source", "result"].includes(item.kind) || !/^(source|result)-[A-Za-z0-9-]{8,80}$/.test(String(item.id || "")) || !/^[A-Fa-f0-9]{64}$/.test(String(item.digest || "")) || !/^[A-Za-z0-9-]{8,120}\.(png|jpg|webp)$/.test(String(item.file || "")) || !MIME_EXT[item.mime] || !Number.isInteger(item.size) || item.size < 1)) throw new Error();
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, revision: 0, items: [] };
      throw new Error("style-studio-library-corrupt");
    }
  }

  _writeIndex(index) {
    this.fs.mkdirSync(this.root, { recursive: true });
    const next = { version: 1, revision: index.revision + 1, items: index.items };
    const temporary = `${this.indexPath}.${process.pid}.${this.randomId()}.tmp`;
    this.fs.writeFileSync(temporary, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
    try { this.fs.renameSync(temporary, this.indexPath); }
    catch (error) { try { this.fs.rmSync(temporary); } catch {} throw error; }
    return next;
  }

  _assetPath(file) {
    if (!/^[A-Za-z0-9-]{8,120}\.(png|jpg|webp)$/.test(String(file || ""))) throw new Error("style-studio-library-corrupt");
    return path.join(this.assetRoot, file);
  }

  list() {
    const index = this._readIndex();
    return { revision: index.revision, items: index.items.map(publicRecord) };
  }

  importSource({ name, mime, bytes }) {
    const checked = validateImage(bytes, mime, SOURCE_LIMIT);
    const index = this._readIndex();
    const digest = crypto.createHash("sha256").update(checked.data).digest("hex");
    const duplicate = index.items.find(item => item.kind === "source" && item.digest === digest);
    if (duplicate) return { created: false, record: publicRecord(duplicate) };
    if (index.items.filter(item => item.kind === "source").length >= MAX_SOURCES) throw new Error("style-studio-source-limit");
    const id = `source-${digest.slice(0, 24)}`;
    const item = {
      id,
      kind: "source",
      name: String(name || "未命名素材").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100) || "未命名素材",
      mime: checked.mime,
      size: checked.data.length,
      width: checked.width,
      height: checked.height,
      digest,
      file: `${digest}.${MIME_EXT[checked.mime]}`,
      createdAt: this.now().toISOString(),
    };
    this.fs.mkdirSync(this.assetRoot, { recursive: true });
    const filePath = this._assetPath(item.file);
    const assetCreated = !this.fs.existsSync(filePath);
    if (assetCreated) this.fs.writeFileSync(filePath, checked.data, { mode: 0o600 });
    try { this._writeIndex({ ...index, items: [...index.items, item] }); }
    catch (error) { if (assetCreated) try { this.fs.rmSync(filePath); } catch {} throw error; }
    return { created: true, record: publicRecord(item) };
  }

  addResult({ sourceId, styleId, styleName, strength, brief, name, mime, bytes }) {
    const checked = validateImage(bytes, mime, RESULT_LIMIT);
    const index = this._readIndex();
    if (!index.items.some(item => item.kind === "source" && item.id === sourceId)) throw new Error("style-studio-source-not-found");
    if (index.items.filter(item => item.kind === "result").length >= MAX_RESULTS) throw new Error("style-studio-result-limit");
    const digest = crypto.createHash("sha256").update(checked.data).digest("hex");
    const id = `result-${this.randomId()}`;
    const item = {
      id,
      kind: "result",
      name: String(name || styleName || "风格作品").slice(0, 100),
      mime: checked.mime,
      size: checked.data.length,
      width: checked.width,
      height: checked.height,
      digest,
      file: `${id}-${digest.slice(0, 16)}.${MIME_EXT[checked.mime]}`,
      sourceId,
      styleId,
      styleName,
      strength,
      brief: String(brief || "").slice(0, 500),
      createdAt: this.now().toISOString(),
    };
    this.fs.mkdirSync(this.assetRoot, { recursive: true });
    const filePath = this._assetPath(item.file);
    this.fs.writeFileSync(filePath, checked.data, { mode: 0o600 });
    try { this._writeIndex({ ...index, items: [...index.items, item] }); }
    catch (error) { try { this.fs.rmSync(filePath); } catch {} throw error; }
    return publicRecord(item);
  }

  read(id, kind) {
    const item = this._readIndex().items.find(entry => entry.id === String(id || "") && (!kind || entry.kind === kind));
    if (!item) throw new Error("style-studio-item-not-found");
    const filePath = this._assetPath(item.file);
    const data = this.fs.readFileSync(filePath);
    const digest = crypto.createHash("sha256").update(data).digest("hex");
    if (digest !== item.digest || data.length !== item.size) throw new Error("style-studio-asset-corrupt");
    validateImage(data, item.mime, item.kind === "source" ? SOURCE_LIMIT : RESULT_LIMIT);
    return { record: publicRecord(item), bytes: data };
  }

  remove(id) {
    const index = this._readIndex();
    const item = index.items.find(entry => entry.id === String(id || ""));
    if (!item) throw new Error("style-studio-item-not-found");
    if (item.kind === "source" && index.items.some(entry => entry.kind === "result" && entry.sourceId === item.id)) throw new Error("style-studio-source-in-use");
    const next = this._writeIndex({ ...index, items: index.items.filter(entry => entry.id !== item.id) });
    if (!next.items.some(entry => entry.file === item.file)) {
      try { this.fs.rmSync(this._assetPath(item.file)); }
      catch (error) { if (error?.code !== "ENOENT") throw new Error("style-studio-asset-delete-failed"); }
    }
    return { removed: publicRecord(item), revision: next.revision };
  }
}

module.exports = { MAX_PIXELS, MAX_RESULTS, MAX_SOURCES, RESULT_LIMIT, SOURCE_LIMIT, StyleStudioStore, sniffImage, validateImage };
