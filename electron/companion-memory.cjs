const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { fingerprintEvent, normalizeEvent } = require("./companion-memory-outbox.cjs");
const { MODEL: LOCAL_EMBEDDING_MODEL, DIMENSIONS: LOCAL_EMBEDDING_DIMENSIONS, cosine, decode, embed, encode } = require("./local-memory-embedding.cjs");

const ROLES = new Set(["user", "assistant"]);
const CANDIDATE_STATES = new Set(["pending", "accepted", "rejected"]);
const ITEM_TYPES = new Set(["daily", "candidate"]);

function boundedText(value, name, maxLength) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name}不能为空`);
  if (text.length > maxLength) throw new Error(`${name}超过长度限制`);
  return text;
}

function boundedId(value, name = "记忆 ID") {
  const id = String(value || "");
  if (!/^[a-f0-9-]{16,64}$/i.test(id)) throw new Error(`${name}格式无效`);
  return id;
}

class CompanionMemoryStore {
  constructor({ userDataPath, now = () => Date.now() }) {
    this.now = now;
    this.filePath = path.join(userDataPath, "companion-memory.sqlite3");
    this.db = new DatabaseSync(this.filePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        summary_day TEXT,
        source_event_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_turns_created_at ON conversation_turns(created_at);
      CREATE INDEX IF NOT EXISTS idx_turns_summary_day ON conversation_turns(summary_day);
      CREATE TABLE IF NOT EXISTS daily_summaries (
        day TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        source_turn_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_candidates (
        id TEXT PRIMARY KEY,
        day TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_turn_ids TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','accepted','rejected')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_candidates_state ON memory_candidates(state, updated_at DESC);
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        candidate_id TEXT PRIMARY KEY REFERENCES memory_candidates(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vector BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES memory_candidates(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(candidate_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS memory_chunk_embeddings (
        chunk_id TEXT PRIMARY KEY REFERENCES memory_chunks(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vector BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS companion_memory_outbox (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','processing','completed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_companion_memory_outbox_status ON companion_memory_outbox(status, created_at);
      CREATE TABLE IF NOT EXISTS companion_memory_meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO companion_memory_meta (key, value) VALUES ('revision', 0);
    `);
    const turnColumns = new Set(this.db.prepare("PRAGMA table_info(conversation_turns)").all().map((column) => column.name));
    if (!turnColumns.has("source_event_id")) this.db.exec("ALTER TABLE conversation_turns ADD COLUMN source_event_id TEXT");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_source_event_id ON conversation_turns(source_event_id) WHERE source_event_id IS NOT NULL;");
    const recovered = this.db.prepare("UPDATE companion_memory_outbox SET status='pending' WHERE status='processing'").run();
    if (recovered.changes) this.bumpRevision();
  }

  bumpRevision() { this.db.prepare("UPDATE companion_memory_meta SET value=value+1 WHERE key='revision'").run(); }

  appendTurn({ sessionId, role, content, createdAt = this.now() } = {}) {
    const normalizedRole = String(role || "");
    if (!ROLES.has(normalizedRole)) throw new Error("记忆角色无效");
    const value = { id: randomUUID(), sessionId: boundedText(sessionId, "会话 ID", 120), role: normalizedRole, content: boundedText(content, "会话内容", 50000), createdAt: Math.max(0, Number(createdAt) || this.now()) };
    this.db.prepare("INSERT INTO conversation_turns (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").run(value.id, value.sessionId, value.role, value.content, value.createdAt);
    this.bumpRevision();
    return { id: value.id, createdAt: value.createdAt };
  }

  commitConversationTurn({ eventId, sessionId, role, content, createdAt = new Date(this.now()).toISOString() } = {}) {
    const event = normalizeEvent({
      eventId,
      sessionId,
      kind: "conversation.turn_final",
      createdAt,
      payload: { role, text: content },
    });
    const fingerprint = fingerprintEvent(event);
    const existing = this.db.prepare("SELECT fingerprint, status FROM companion_memory_outbox WHERE event_id=?").get(event.eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("memory-event-id-collision");
      return { ok: true, inserted: false, eventId: event.eventId, status: existing.status };
    }

    const at = new Date(event.createdAt).getTime();
    const turnId = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO companion_memory_outbox (event_id, session_id, kind, payload_json, fingerprint, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'processing', 1, ?)")
        .run(event.eventId, event.sessionId, event.kind, JSON.stringify(event.payload), fingerprint, at);
      this.db.prepare("INSERT INTO conversation_turns (id, session_id, role, content, created_at, source_event_id) VALUES (?, ?, ?, ?, ?, ?)")
        .run(turnId, event.sessionId, event.payload.role, event.payload.text, at, event.eventId);
      this.db.prepare("UPDATE companion_memory_outbox SET status='completed', completed_at=? WHERE event_id=?").run(this.now(), event.eventId);
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, inserted: true, eventId: event.eventId, turnId, status: "completed" };
  }

  upsertDailySummary({ day, summary, sourceTurnCount = 0 } = {}) {
    const normalizedDay = boundedText(day, "摘要日期", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) throw new Error("摘要日期格式无效");
    const text = boundedText(summary, "每日摘要", 30000);
    const at = this.now();
    this.db.prepare("INSERT INTO daily_summaries (day, summary, source_turn_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET summary=excluded.summary, source_turn_count=excluded.source_turn_count, updated_at=excluded.updated_at").run(normalizedDay, text, Math.max(0, Number(sourceTurnCount) || 0), at, at);
    this.bumpRevision();
    return { day: normalizedDay, updatedAt: at };
  }

  addCandidate({ day, kind = "preference", summary, sourceTurnIds = [] } = {}) {
    const id = randomUUID();
    const at = this.now();
    const normalizedDay = boundedText(day, "候选日期", 10);
    const normalizedKind = boundedText(kind, "候选类型", 60);
    const sourceIds = Array.isArray(sourceTurnIds) ? sourceTurnIds.slice(0, 200).map((value) => String(value || "")).filter((value) => /^[a-f0-9-]{16,64}$/i.test(value)) : [];
    this.db.prepare("INSERT INTO memory_candidates (id, day, kind, summary, source_turn_ids, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)").run(id, normalizedDay, normalizedKind, boundedText(summary, "记忆候选", 10000), JSON.stringify(sourceIds), at, at);
    this.bumpRevision();
    return { id, state: "pending", createdAt: at };
  }

  listUnprocessedTurns({ limit = 120 } = {}) {
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 120));
    return this.db.prepare("SELECT id, session_id AS sessionId, role, content, created_at AS createdAt FROM conversation_turns WHERE summary_day IS NULL ORDER BY created_at ASC LIMIT ?").all(boundedLimit);
  }

  applyGeneratedMemory({ day, summary, candidates = [], turnIds = [] } = {}) {
    const normalizedDay = boundedText(day, "摘要日期", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) throw new Error("摘要日期格式无效");
    const normalizedSummary = boundedText(summary, "每日摘要", 30000);
    const ids = Array.isArray(turnIds) ? [...new Set(turnIds.map((value) => String(value || "")).filter((value) => /^[a-f0-9-]{16,64}$/i.test(value)))].slice(0, 500) : [];
    if (!ids.length) throw new Error("memory-summary-source-turns-required");
    const rows = this.db.prepare(`SELECT id FROM conversation_turns WHERE id IN (${ids.map(() => "?").join(",")}) AND summary_day IS NULL`).all(...ids);
    if (rows.length !== ids.length) throw new Error("memory-summary-source-turns-changed");
    const normalizedCandidates = Array.isArray(candidates) ? candidates.slice(0, 40).map((item) => ({
      id: createHash("sha256").update(JSON.stringify([normalizedDay, String(item?.kind || "preference"), String(item?.summary || "").trim(), ids])).digest("hex").slice(0, 32),
      kind: boundedText(item?.kind || "preference", "候选类型", 60),
      summary: boundedText(item?.summary, "记忆候选", 10000),
    })) : [];
    const at = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO daily_summaries (day, summary, source_turn_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET summary=excluded.summary, source_turn_count=daily_summaries.source_turn_count+excluded.source_turn_count, updated_at=excluded.updated_at").run(normalizedDay, normalizedSummary, ids.length, at, at);
      const insert = this.db.prepare("INSERT OR IGNORE INTO memory_candidates (id, day, kind, summary, source_turn_ids, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)");
      for (const item of normalizedCandidates) insert.run(item.id, normalizedDay, item.kind, item.summary, JSON.stringify(ids), at, at);
      this.db.prepare(`UPDATE conversation_turns SET summary_day=? WHERE id IN (${ids.map(() => "?").join(",")}) AND summary_day IS NULL`).run(normalizedDay, ...ids);
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, day: normalizedDay, turns: ids.length, candidates: normalizedCandidates.length };
  }

  projectionItems() {
    const dailySummaries = this.db.prepare("SELECT day, summary, source_turn_count AS sourceTurnCount, updated_at AS updatedAt FROM daily_summaries ORDER BY day ASC").all();
    const memories = this.db.prepare("SELECT id, day, kind, summary, updated_at AS updatedAt FROM memory_candidates WHERE state='accepted' ORDER BY day ASC, updated_at ASC").all();
    return { dailySummaries, memories };
  }

  recentAcceptedContext({ limit = 12, maxCharacters = 4000 } = {}) {
    const rows = this.db.prepare("SELECT id, day, kind, summary FROM memory_candidates WHERE state='accepted' ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Math.min(30, Number(limit) || 12)));
    let used = 0;
    const result = [];
    for (const row of rows) {
      const summary = String(row.summary || "").trim();
      if (!summary || used + summary.length > maxCharacters) continue;
      result.push({ id: row.id, day: row.day, kind: row.kind, summary });
      used += summary.length;
    }
    return result;
  }

  rebuildLocalIndex({ chunkLength = 480 } = {}) {
    const size = Math.max(160, Math.min(1200, Number(chunkLength) || 480));
    const memories = this.db.prepare("SELECT id, summary FROM memory_candidates WHERE state='accepted' ORDER BY id").all();
    const at = this.now();
    const desired = [];
    for (const memory of memories) {
      const paragraphs = String(memory.summary).split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
      const parts = [];
      for (const paragraph of paragraphs.length ? paragraphs : [String(memory.summary)]) for (let offset = 0; offset < paragraph.length; offset += size) parts.push(paragraph.slice(offset, offset + size));
      for (let ordinal = 0; ordinal < parts.length; ordinal += 1) {
        const content = parts[ordinal];
        desired.push({ id: createHash("sha256").update(`${memory.id}:${ordinal}:${content}`).digest("hex").slice(0, 32), candidateId: memory.id, ordinal, content, contentHash: createHash("sha256").update(content).digest("hex") });
      }
    }
    const existing = new Map(this.db.prepare("SELECT c.id, c.content_hash AS contentHash, e.model, e.dimensions FROM memory_chunks c LEFT JOIN memory_chunk_embeddings e ON e.chunk_id=c.id").all().map((row) => [row.id, row]));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const upsertChunk = this.db.prepare("INSERT INTO memory_chunks (id, candidate_id, ordinal, content, content_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET candidate_id=excluded.candidate_id, ordinal=excluded.ordinal, content=excluded.content, content_hash=excluded.content_hash, updated_at=excluded.updated_at");
      const upsertVector = this.db.prepare("INSERT INTO memory_chunk_embeddings (chunk_id, model, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chunk_id) DO UPDATE SET model=excluded.model, dimensions=excluded.dimensions, vector=excluded.vector, created_at=excluded.created_at");
      let indexed = 0;
      let reused = 0;
      const desiredIds = new Set();
      for (const item of desired) {
        desiredIds.add(item.id);
        const current = existing.get(item.id);
        if (current?.contentHash === item.contentHash && current.model === LOCAL_EMBEDDING_MODEL && current.dimensions === LOCAL_EMBEDDING_DIMENSIONS) { reused += 1; continue; }
        upsertChunk.run(item.id, item.candidateId, item.ordinal, item.content, item.contentHash, at);
        upsertVector.run(item.id, LOCAL_EMBEDDING_MODEL, LOCAL_EMBEDDING_DIMENSIONS, encode(embed(item.content)), at);
        indexed += 1;
      }
      let removed = 0;
      const remove = this.db.prepare("DELETE FROM memory_chunks WHERE id=?");
      for (const id of existing.keys()) if (!desiredIds.has(id)) { remove.run(id); removed += 1; }
      this.bumpRevision();
      this.db.exec("COMMIT");
      return { ok: true, model: LOCAL_EMBEDDING_MODEL, memories: memories.length, chunks: desired.length, indexed, reused, removed };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
  }

  searchLongTermMemory({ query, limit = 8 } = {}) {
    const text = String(query || "").trim().slice(0, 500);
    if (!text) return [];
    const target = embed(text);
    const boundedLimit = Math.max(1, Math.min(20, Number(limit) || 8));
    const rows = this.db.prepare("SELECT c.id AS chunkId, c.candidate_id AS candidateId, c.content, m.day, m.kind, e.dimensions, e.vector FROM memory_chunks c JOIN memory_chunk_embeddings e ON e.chunk_id=c.id JOIN memory_candidates m ON m.id=c.candidate_id WHERE m.state='accepted'").all();
    const terms = text.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.map((row) => {
      const content = String(row.content);
      const keyword = terms.length ? terms.filter((term) => content.toLocaleLowerCase().includes(term)).length / terms.length : 0;
      const vector = cosine(target, decode(row.vector, row.dimensions));
      return { id: row.candidateId, chunkId: row.chunkId, day: row.day, kind: row.kind, content, score: Math.round((Math.max(0, vector) * 0.75 + keyword * 0.25) * 10000) / 10000 };
    }).sort((left, right) => right.score - left.score).slice(0, boundedLimit);
  }

  setCandidateState(id, state) {
    const normalizedState = String(state || "");
    if (!CANDIDATE_STATES.has(normalizedState) || normalizedState === "pending") throw new Error("候选状态无效");
    const candidateId = boundedId(id, "候选 ID");
    const current = this.db.prepare("SELECT state FROM memory_candidates WHERE id=?").get(candidateId);
    if (!current) return { ok: false, reason: "memory-item-not-found" };
    if (current.state !== "pending") return { ok: false, reason: "memory-candidate-already-reviewed" };
    this.db.prepare("UPDATE memory_candidates SET state=?, updated_at=? WHERE id=?").run(normalizedState, this.now(), candidateId);
    this.bumpRevision();
    return { ok: true };
  }

  updateCandidate({ id, summary } = {}) {
    const candidateId = boundedId(id, "候选 ID");
    const text = boundedText(summary, "记忆内容", 10000);
    const current = this.db.prepare("SELECT state FROM memory_candidates WHERE id=?").get(candidateId);
    if (!current) return { ok: false, reason: "memory-item-not-found" };
    if (!["pending", "accepted"].includes(current.state)) return { ok: false, reason: "memory-item-not-editable" };
    this.db.prepare("UPDATE memory_candidates SET summary=?, updated_at=? WHERE id=?").run(text, this.now(), candidateId);
    this.bumpRevision();
    return { ok: true, state: current.state };
  }

  mutationRevision({ scope = "item", type, id } = {}) {
    if (scope === "all") {
      return `all:${this.db.prepare("SELECT value FROM companion_memory_meta WHERE key='revision'").get().value}`;
    }
    if (!ITEM_TYPES.has(type)) throw new Error("memory-item-type-invalid");
    if (type === "daily") {
      const day = boundedText(id, "摘要日期", 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("摘要日期格式无效");
      const row = this.db.prepare("SELECT updated_at, summary FROM daily_summaries WHERE day=?").get(day);
      return row ? `daily:${day}:${row.updated_at}:${createHash("sha256").update(row.summary).digest("hex")}` : null;
    }
    const candidateId = boundedId(id);
    const row = this.db.prepare("SELECT updated_at, state, summary FROM memory_candidates WHERE id=?").get(candidateId);
    return row ? `candidate:${candidateId}:${row.updated_at}:${row.state}:${createHash("sha256").update(row.summary).digest("hex")}` : null;
  }

  deleteItem({ type, id } = {}) {
    if (!ITEM_TYPES.has(type)) throw new Error("memory-item-type-invalid");
    if (type === "daily") {
      const day = boundedText(id, "摘要日期", 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("摘要日期格式无效");
      const deleted = this.db.prepare("DELETE FROM daily_summaries WHERE day=?").run(day).changes === 1;
      if (deleted) this.bumpRevision();
      return { ok: deleted, scope: "item", type };
    }
    const deleted = this.db.prepare("DELETE FROM memory_candidates WHERE id=?").run(boundedId(id)).changes === 1;
    if (deleted) this.bumpRevision();
    return { ok: deleted, scope: "item", type };
  }

  forgetAll() {
    const before = this.status();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM memory_chunk_embeddings; DELETE FROM memory_chunks; DELETE FROM memory_embeddings; DELETE FROM memory_candidates; DELETE FROM daily_summaries; DELETE FROM conversation_turns; DELETE FROM companion_memory_outbox;");
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, scope: "all", removed: { turns: before.turns, dailySummaries: before.dailySummaries, pendingCandidates: before.pendingCandidates, longTermMemories: before.longTermMemories, embeddings: before.embeddings } };
  }

  exportReviewed({ exportedAt = new Date(this.now()).toISOString() } = {}) {
    const instant = new Date(exportedAt);
    if (Number.isNaN(instant.getTime())) throw new Error("memory-export-time-invalid");
    const dailySummaries = this.db.prepare("SELECT day, summary FROM daily_summaries ORDER BY day ASC").all().map((item) => ({ day: item.day, summary: item.summary }));
    const longTermMemories = this.db.prepare("SELECT day, kind, summary FROM memory_candidates WHERE state='accepted' ORDER BY day ASC, updated_at ASC").all().map((item) => ({ day: item.day, kind: item.kind, summary: item.summary }));
    return { schema: "deskmate.memory.export.v1", exportedAt: instant.toISOString(), dailySummaries, longTermMemories };
  }

  status() {
    const scalar = (sql) => Number(this.db.prepare(sql).get()?.value || 0);
    return {
      ready: true,
      storage: "sqlite-wal",
      turns: scalar("SELECT COUNT(*) AS value FROM conversation_turns"),
      dailySummaries: scalar("SELECT COUNT(*) AS value FROM daily_summaries"),
      pendingCandidates: scalar("SELECT COUNT(*) AS value FROM memory_candidates WHERE state='pending'"),
      longTermMemories: scalar("SELECT COUNT(*) AS value FROM memory_candidates WHERE state='accepted'"),
      embeddings: scalar("SELECT COUNT(*) AS value FROM memory_chunk_embeddings") + scalar("SELECT COUNT(*) AS value FROM memory_embeddings"),
      unprocessedTurns: scalar("SELECT COUNT(*) AS value FROM conversation_turns WHERE summary_day IS NULL"),
      indexedChunks: scalar("SELECT COUNT(*) AS value FROM memory_chunk_embeddings"),
    };
  }

  list({ filter = "all", query = "", limit = 100 } = {}) {
    const normalizedQuery = String(query || "").trim().slice(0, 200);
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const like = `%${normalizedQuery.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
    const summaries = ["all", "daily"].includes(filter) ? this.db.prepare("SELECT day AS id, 'daily' AS type, day, summary AS content, updated_at AS updatedAt FROM daily_summaries WHERE (? = '' OR summary LIKE ? ESCAPE '\\') ORDER BY day DESC LIMIT ?").all(normalizedQuery, like, boundedLimit) : [];
    const states = filter === "long-term" ? ["accepted"] : filter === "candidates" ? ["pending"] : ["pending", "accepted", "rejected"];
    const placeholders = states.map(() => "?").join(",");
    const candidates = ["all", "candidates", "long-term"].includes(filter) ? this.db.prepare(`SELECT id, 'candidate' AS type, day, kind, summary AS content, state, updated_at AS updatedAt FROM memory_candidates WHERE state IN (${placeholders}) AND (? = '' OR summary LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?`).all(...states, normalizedQuery, like, boundedLimit) : [];
    return [...summaries, ...candidates].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, boundedLimit);
  }

  close() { this.db.close(); }
}

module.exports = { CompanionMemoryStore };
