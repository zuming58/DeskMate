const path = require("path");
const { randomUUID } = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const ROLES = new Set(["user", "assistant"]);
const CANDIDATE_STATES = new Set(["pending", "accepted", "rejected"]);

function boundedText(value, name, maxLength) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name}不能为空`);
  if (text.length > maxLength) throw new Error(`${name}超过长度限制`);
  return text;
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
        summary_day TEXT
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
    `);
  }

  appendTurn({ sessionId, role, content, createdAt = this.now() } = {}) {
    const normalizedRole = String(role || "");
    if (!ROLES.has(normalizedRole)) throw new Error("记忆角色无效");
    const value = { id: randomUUID(), sessionId: boundedText(sessionId, "会话 ID", 120), role: normalizedRole, content: boundedText(content, "会话内容", 50000), createdAt: Math.max(0, Number(createdAt) || this.now()) };
    this.db.prepare("INSERT INTO conversation_turns (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").run(value.id, value.sessionId, value.role, value.content, value.createdAt);
    return { id: value.id, createdAt: value.createdAt };
  }

  upsertDailySummary({ day, summary, sourceTurnCount = 0 } = {}) {
    const normalizedDay = boundedText(day, "摘要日期", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) throw new Error("摘要日期格式无效");
    const text = boundedText(summary, "每日摘要", 30000);
    const at = this.now();
    this.db.prepare("INSERT INTO daily_summaries (day, summary, source_turn_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET summary=excluded.summary, source_turn_count=excluded.source_turn_count, updated_at=excluded.updated_at").run(normalizedDay, text, Math.max(0, Number(sourceTurnCount) || 0), at, at);
    return { day: normalizedDay, updatedAt: at };
  }

  addCandidate({ day, kind = "preference", summary, sourceTurnIds = [] } = {}) {
    const id = randomUUID();
    const at = this.now();
    const normalizedDay = boundedText(day, "候选日期", 10);
    const normalizedKind = boundedText(kind, "候选类型", 60);
    const sourceIds = Array.isArray(sourceTurnIds) ? sourceTurnIds.slice(0, 200).map((value) => String(value || "")).filter((value) => /^[a-f0-9-]{16,64}$/i.test(value)) : [];
    this.db.prepare("INSERT INTO memory_candidates (id, day, kind, summary, source_turn_ids, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)").run(id, normalizedDay, normalizedKind, boundedText(summary, "记忆候选", 10000), JSON.stringify(sourceIds), at, at);
    return { id, state: "pending", createdAt: at };
  }

  setCandidateState(id, state) {
    const normalizedState = String(state || "");
    if (!CANDIDATE_STATES.has(normalizedState)) throw new Error("候选状态无效");
    const result = this.db.prepare("UPDATE memory_candidates SET state=?, updated_at=? WHERE id=?").run(normalizedState, this.now(), boundedText(id, "候选 ID", 64));
    return { ok: result.changes === 1 };
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
      embeddings: scalar("SELECT COUNT(*) AS value FROM memory_embeddings"),
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
