const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const MANIFEST_VERSION = 1;
const ROOT_DIRECTORY = "DeskMate";

function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function safeDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "unknown-day"; }
function safeId(value) { return /^[a-f0-9-]{16,64}$/i.test(String(value || "")) ? String(value) : "invalid-memory"; }
function yamlText(value) { return JSON.stringify(String(value || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 500)); }
function safeSource(value) { return ["companion", "dictation"].includes(value) ? value : "companion"; }

function dailyDocument(item, memories) {
  const source = safeSource(item.source);
  const links = memories.filter((memory) => memory.day === item.day && safeSource(memory.source) === source).map((memory) => `- [[memories/${safeId(memory.id)}|${String(memory.summary).split(/\r?\n/, 1)[0].slice(0, 80)}]]`).join("\n");
  return `---\ndeskmate_schema: daily-summary-v1\nday: ${safeDay(item.day)}\nsource: ${yamlText(source)}\nsource_turn_count: ${Math.max(0, Number(item.sourceTurnCount) || 0)}\n---\n\n# ${safeDay(item.day)} ${source === "dictation" ? "语音输入" : "陪伴对话"}摘要\n\n${String(item.summary || "").trim()}\n\n## 长期记忆\n\n${links || "- 暂无已审核长期记忆"}\n`;
}

function memoryDocument(item) {
  const source = ["companion", "dictation", "mixed"].includes(item.source) ? item.source : "companion";
  return `---\ndeskmate_schema: reviewed-memory-v1\nid: ${safeId(item.id)}\nday: ${safeDay(item.day)}\nsource: ${yamlText(source)}\nkind: ${yamlText(item.kind)}\n---\n\n# 已审核长期记忆\n\n${String(item.summary || "").trim()}\n\n## 来源\n\n- [[daily/${source}/${safeDay(item.day)}|${safeDay(item.day)} ${source === "dictation" ? "语音输入" : "陪伴对话"}摘要]]\n`;
}

function writeAtomic(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
}

class KnowledgeBaseProjection {
  constructor({ root, now = () => new Date().toISOString() } = {}) {
    if (!path.isAbsolute(String(root || ""))) throw new Error("knowledge-base-location-invalid");
    this.root = path.resolve(root);
    this.base = path.join(this.root, ROOT_DIRECTORY);
    this.manifestPath = path.join(this.base, ".deskmate-manifest.json");
    this.now = now;
  }

  readManifest() {
    try {
      const value = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
      return value?.version === MANIFEST_VERSION && value.files && typeof value.files === "object" ? value : { version: MANIFEST_VERSION, files: {} };
    } catch { return { version: MANIFEST_VERSION, files: {} }; }
  }

  sync({ dailySummaries = [], memories = [] } = {}) {
    const previous = this.readManifest();
    const desired = new Map();
    for (const item of dailySummaries) desired.set(`daily/${safeSource(item.source)}/${safeDay(item.day)}.md`, dailyDocument(item, memories));
    for (const item of memories) desired.set(`memories/${safeId(item.id)}.md`, memoryDocument(item));
    const nextFiles = {};
    let written = 0;
    let removed = 0;
    let conflicts = 0;
    for (const [relative, content] of desired) {
      const target = path.join(this.base, ...relative.split("/"));
      const previousHash = previous.files[relative];
      let currentHash = "";
      try { currentHash = hash(fs.readFileSync(target)); } catch { /* new file */ }
      if (currentHash && previousHash && currentHash !== previousHash) {
        conflicts += 1;
        nextFiles[relative] = previousHash;
        continue;
      }
      const contentHash = hash(content);
      if (currentHash !== contentHash) { writeAtomic(target, content); written += 1; }
      nextFiles[relative] = contentHash;
    }
    for (const [relative, previousHash] of Object.entries(previous.files)) {
      if (desired.has(relative)) continue;
      const target = path.join(this.base, ...relative.split("/"));
      try {
        if (hash(fs.readFileSync(target)) !== previousHash) { conflicts += 1; nextFiles[relative] = previousHash; continue; }
        fs.unlinkSync(target);
        removed += 1;
      } catch { /* already gone */ }
    }
    const manifest = { version: MANIFEST_VERSION, projection: "markdown-double-link-v1", updatedAt: this.now(), files: nextFiles };
    writeAtomic(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { ok: conflicts === 0, projection: manifest.projection, files: Object.keys(nextFiles).length, written, removed, conflicts };
  }
}

module.exports = { KnowledgeBaseProjection, ROOT_DIRECTORY, dailyDocument, memoryDocument };
