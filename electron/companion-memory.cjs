const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { fingerprintEvent, normalizeEvent } = require("./companion-memory-outbox.cjs");
const { MODEL: LOCAL_EMBEDDING_MODEL, DIMENSIONS: LOCAL_EMBEDDING_DIMENSIONS, cosine, decode, embed, encode } = require("./local-memory-embedding.cjs");

const ROLES = new Set(["user", "assistant"]);
const TURN_SOURCES = new Set(["companion", "dictation"]);
const ITEM_SOURCES = new Set(["companion", "dictation", "mixed"]);
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

function boundedSource(value, { mixed = false } = {}) {
  const source = String(value || "companion");
  if (!(mixed ? ITEM_SOURCES : TURN_SOURCES).has(source)) throw new Error("memory-source-invalid");
  return source;
}

function sourceScope(sources) {
  const normalized = [...new Set((sources || []).filter((source) => TURN_SOURCES.has(source)))];
  return normalized.length > 1 ? "mixed" : normalized[0] || "companion";
}

function parseDailyItemId(value) {
  const id = boundedText(value, "摘要 ID", 32);
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) return { source: "companion", day: id };
  const matched = /^(companion|dictation):(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!matched) throw new Error("摘要 ID 格式无效");
  return { source: matched[1], day: matched[2] };
}

function localDayAt(timestamp = Date.now()) {
  const value = new Date(Number(timestamp));
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
        source_event_id TEXT,
        source TEXT NOT NULL DEFAULT 'companion'
      );
      CREATE INDEX IF NOT EXISTS idx_turns_created_at ON conversation_turns(created_at);
      CREATE INDEX IF NOT EXISTS idx_turns_summary_day ON conversation_turns(summary_day);
      CREATE TABLE IF NOT EXISTS daily_summaries (
        day TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('companion','dictation')),
        summary TEXT NOT NULL,
        source_turn_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(day, source)
      );
      CREATE TABLE IF NOT EXISTS memory_candidates (
        id TEXT PRIMARY KEY,
        day TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_turn_ids TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','accepted','rejected')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'companion'
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
      CREATE TABLE IF NOT EXISTS memory_digest_runs (
        idempotency_key TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK(source IN ('companion','dictation')),
        day TEXT NOT NULL,
        input_digest TEXT NOT NULL,
        source_turn_count INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        UNIQUE(source, day, input_digest)
      );
      CREATE TABLE IF NOT EXISTS memory_workday_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        active_day TEXT NOT NULL,
        period_start INTEGER NOT NULL,
        last_close_calendar_day TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_hourly_summaries (
        workday_day TEXT NOT NULL,
        hour_key TEXT NOT NULL,
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        input_digest TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_turn_ids TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(workday_day, hour_key),
        UNIQUE(workday_day, input_digest)
      );
      CREATE TABLE IF NOT EXISTS memory_daily_journals (
        day TEXT PRIMARY KEY,
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('closing','completed')),
        work_markdown TEXT NOT NULL DEFAULT '',
        personal_markdown TEXT NOT NULL DEFAULT '',
        combined_markdown TEXT NOT NULL DEFAULT '',
        input_digest TEXT NOT NULL DEFAULT '',
        source_turn_count INTEGER NOT NULL DEFAULT 0,
        source_counts_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS memory_journal_outbox (
        id TEXT PRIMARY KEY,
        day TEXT NOT NULL,
        memory_class TEXT NOT NULL CHECK(memory_class IN ('work','personal')),
        project_id TEXT,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('pending','sending','accepted','failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        submission_id TEXT,
        last_error TEXT NOT NULL DEFAULT '',
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        accepted_at INTEGER,
        UNIQUE(day, memory_class)
      );
      INSERT OR IGNORE INTO companion_memory_meta (key, value) VALUES ('revision', 0);
    `);
    const turnColumns = new Set(this.db.prepare("PRAGMA table_info(conversation_turns)").all().map((column) => column.name));
    if (!turnColumns.has("source_event_id")) this.db.exec("ALTER TABLE conversation_turns ADD COLUMN source_event_id TEXT");
    if (!turnColumns.has("source")) this.db.exec("ALTER TABLE conversation_turns ADD COLUMN source TEXT NOT NULL DEFAULT 'companion'");
    if (!turnColumns.has("workday_day")) this.db.exec("ALTER TABLE conversation_turns ADD COLUMN workday_day TEXT");
    const summaryColumns = new Set(this.db.prepare("PRAGMA table_info(daily_summaries)").all().map((column) => column.name));
    if (!summaryColumns.has("source")) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec("ALTER TABLE daily_summaries RENAME TO daily_summaries_legacy; CREATE TABLE daily_summaries (day TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('companion','dictation')), summary TEXT NOT NULL, source_turn_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(day, source)); INSERT INTO daily_summaries (day, source, summary, source_turn_count, created_at, updated_at) SELECT day, 'companion', summary, source_turn_count, created_at, updated_at FROM daily_summaries_legacy; DROP TABLE daily_summaries_legacy;");
        this.db.exec("COMMIT");
      } catch (error) { try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ } throw error; }
    }
    const candidateColumns = new Set(this.db.prepare("PRAGMA table_info(memory_candidates)").all().map((column) => column.name));
    if (!candidateColumns.has("source")) this.db.exec("ALTER TABLE memory_candidates ADD COLUMN source TEXT NOT NULL DEFAULT 'companion'");
    const journalColumns = new Set(this.db.prepare("PRAGMA table_info(memory_daily_journals)").all().map((column) => column.name));
    if (!journalColumns.has("source_counts_json")) this.db.exec("ALTER TABLE memory_daily_journals ADD COLUMN source_counts_json TEXT NOT NULL DEFAULT '{}'");
    for (const row of this.db.prepare("SELECT id, created_at AS createdAt FROM conversation_turns WHERE workday_day IS NULL OR workday_day='' ").all()) {
      this.db.prepare("UPDATE conversation_turns SET workday_day=? WHERE id=?").run(localDayAt(row.createdAt), row.id);
    }
    const initialDay = localDayAt(this.now());
    const [year, month, date] = initialDay.split("-").map(Number);
    const initialStart = new Date(year, month - 1, date).getTime();
    this.db.prepare("INSERT OR IGNORE INTO memory_workday_state (id, active_day, period_start, updated_at) VALUES (1, ?, ?, ?)").run(initialDay, initialStart, this.now());
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_source_event_id ON conversation_turns(source_event_id) WHERE source_event_id IS NOT NULL;");
    const recovered = this.db.prepare("UPDATE companion_memory_outbox SET status='pending' WHERE status='processing'").run();
    if (recovered.changes) this.bumpRevision();
  }

  bumpRevision() { this.db.prepare("UPDATE companion_memory_meta SET value=value+1 WHERE key='revision'").run(); }

  appendTurn({ sessionId, role, content, source = "companion", createdAt = this.now() } = {}) {
    const normalizedRole = String(role || "");
    if (!ROLES.has(normalizedRole)) throw new Error("记忆角色无效");
    const value = { id: randomUUID(), sessionId: boundedText(sessionId, "会话 ID", 120), role: normalizedRole, content: boundedText(content, "会话内容", 50000), source: boundedSource(source), createdAt: Math.max(0, Number(createdAt) || this.now()) };
    const workdayDay = this.ensureActiveWorkday(value.createdAt).day;
    this.db.prepare("INSERT INTO conversation_turns (id, session_id, role, content, created_at, source, workday_day) VALUES (?, ?, ?, ?, ?, ?, ?)").run(value.id, value.sessionId, value.role, value.content, value.createdAt, value.source, workdayDay);
    this.bumpRevision();
    return { id: value.id, createdAt: value.createdAt };
  }

  commitConversationTurn({ eventId, sessionId, role, content, source = "companion", createdAt = new Date(this.now()).toISOString() } = {}) {
    const normalizedSource = boundedSource(source);
    const event = normalizeEvent({
      eventId,
      sessionId,
      kind: "conversation.turn_final",
      createdAt,
      payload: { role, text: content },
    });
    const fingerprint = fingerprintEvent(event);
    const existing = this.db.prepare("SELECT o.fingerprint, o.status, t.source FROM companion_memory_outbox o LEFT JOIN conversation_turns t ON t.source_event_id=o.event_id WHERE o.event_id=?").get(event.eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint || (existing.source && existing.source !== normalizedSource)) throw new Error("memory-event-id-collision");
      return { ok: true, inserted: false, eventId: event.eventId, status: existing.status };
    }

    const at = new Date(event.createdAt).getTime();
    const turnId = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO companion_memory_outbox (event_id, session_id, kind, payload_json, fingerprint, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'processing', 1, ?)")
        .run(event.eventId, event.sessionId, event.kind, JSON.stringify(event.payload), fingerprint, at);
      const workdayDay = this.ensureActiveWorkday(at).day;
      this.db.prepare("INSERT INTO conversation_turns (id, session_id, role, content, created_at, source_event_id, source, workday_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(turnId, event.sessionId, event.payload.role, event.payload.text, at, event.eventId, normalizedSource, workdayDay);
      this.db.prepare("UPDATE companion_memory_outbox SET status='completed', completed_at=? WHERE event_id=?").run(this.now(), event.eventId);
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, inserted: true, eventId: event.eventId, turnId, status: "completed" };
  }

  upsertDailySummary({ day, summary, sourceTurnCount = 0, source, sources = ["companion"] } = {}) {
    const normalizedDay = boundedText(day, "摘要日期", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) throw new Error("摘要日期格式无效");
    const text = boundedText(summary, "每日摘要", 30000);
    const at = this.now();
    const normalizedSource = boundedSource(source || (Array.isArray(sources) ? sources[0] : "companion"));
    this.db.prepare("INSERT INTO daily_summaries (day, source, summary, source_turn_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, source) DO UPDATE SET summary=excluded.summary, source_turn_count=excluded.source_turn_count, updated_at=excluded.updated_at").run(normalizedDay, normalizedSource, text, Math.max(0, Number(sourceTurnCount) || 0), at, at);
    this.bumpRevision();
    return { day: normalizedDay, updatedAt: at };
  }

  addCandidate({ day, kind = "preference", summary, sourceTurnIds = [], source = "companion" } = {}) {
    const id = randomUUID();
    const at = this.now();
    const normalizedDay = boundedText(day, "候选日期", 10);
    const normalizedKind = boundedText(kind, "候选类型", 60);
    const sourceIds = Array.isArray(sourceTurnIds) ? sourceTurnIds.slice(0, 200).map((value) => String(value || "")).filter((value) => /^[a-f0-9-]{16,64}$/i.test(value)) : [];
    const normalizedSource = boundedSource(source, { mixed: true });
    this.db.prepare("INSERT INTO memory_candidates (id, day, kind, summary, source_turn_ids, state, created_at, updated_at, source) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)").run(id, normalizedDay, normalizedKind, boundedText(summary, "记忆候选", 10000), JSON.stringify(sourceIds), at, at, normalizedSource);
    this.bumpRevision();
    return { id, state: "pending", createdAt: at };
  }

  listUnprocessedTurns({ limit = 120, sources = ["companion", "dictation"], day = "" } = {}) {
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 120));
    const normalizedSources = [...new Set((Array.isArray(sources) ? sources : []).map((source) => boundedSource(source)))];
    if (!normalizedSources.length) return [];
    const placeholders = normalizedSources.map(() => "?").join(",");
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;
    if (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("memory-day-invalid");
      const [year, month, date] = day.split("-").map(Number);
      start = new Date(year, month - 1, date).getTime();
      end = new Date(year, month - 1, date + 1).getTime();
    }
    return this.db.prepare(`SELECT id, session_id AS sessionId, role, content, source, created_at AS createdAt FROM conversation_turns WHERE summary_day IS NULL AND source IN (${placeholders}) AND created_at>=? AND created_at<? ORDER BY created_at ASC, rowid ASC LIMIT ?`).all(...normalizedSources, start, end, boundedLimit);
  }

  unprocessedDays({ source } = {}) {
    const normalizedSource = boundedSource(source);
    return [...new Set(this.db.prepare("SELECT created_at AS createdAt FROM conversation_turns WHERE source=? AND summary_day IS NULL ORDER BY created_at ASC").all(normalizedSource).map((row) => localDayAt(row.createdAt)).filter(Boolean))];
  }

  hasDigestRun({ source, day, inputDigest } = {}) {
    const normalizedSource = boundedSource(source);
    const normalizedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) ? String(day) : "";
    const digest = /^[a-f0-9]{64}$/i.test(String(inputDigest || "")) ? String(inputDigest).toLowerCase() : "";
    if (!normalizedDay || !digest) return false;
    return Boolean(this.db.prepare("SELECT 1 AS value FROM memory_digest_runs WHERE source=? AND day=? AND input_digest=?").get(normalizedSource, normalizedDay, digest)?.value);
  }

  applyGeneratedMemory({ day, summary, candidates = [], turnIds = [], source = "companion", inputDigest, idempotencyKey, replacesSummary = false } = {}) {
    const normalizedDay = boundedText(day, "摘要日期", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) throw new Error("摘要日期格式无效");
    const normalizedSource = boundedSource(source);
    const digest = String(inputDigest || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("memory-input-digest-invalid");
    const digestKey = String(idempotencyKey || "").toLowerCase();
    const expectedKey = createHash("sha256").update(`${normalizedSource}:${normalizedDay}:${digest}`).digest("hex");
    if (digestKey !== expectedKey) throw new Error("memory-idempotency-key-invalid");
    if (this.hasDigestRun({ source: normalizedSource, day: normalizedDay, inputDigest: digest })) return { ok: true, skipped: true, reason: "memory-digest-already-completed", day: normalizedDay, inputDigest: digest, source: normalizedSource, turns: 0, candidates: 0 };
    const normalizedSummary = boundedText(summary, "每日摘要", 30000);
    const ids = Array.isArray(turnIds) ? [...new Set(turnIds.map((value) => String(value || "")).filter((value) => /^[a-f0-9-]{16,64}$/i.test(value)))].slice(0, 500) : [];
    if (!ids.length) throw new Error("memory-summary-source-turns-required");
    const rows = this.db.prepare(`SELECT id, source FROM conversation_turns WHERE id IN (${ids.map(() => "?").join(",")}) AND summary_day IS NULL`).all(...ids);
    if (rows.length !== ids.length) throw new Error("memory-summary-source-turns-changed");
    const sources = [...new Set(rows.map((row) => boundedSource(row.source)))].sort();
    const scope = sourceScope(sources);
    if (scope !== normalizedSource || sources.length !== 1) throw new Error("memory-summary-source-mismatch");
    const normalizedCandidates = Array.isArray(candidates) ? candidates.slice(0, 40).map((item) => ({
      id: createHash("sha256").update(JSON.stringify([normalizedSource, normalizedDay, digest, String(item?.kind || "preference"), String(item?.summary || "").trim(), ids])).digest("hex").slice(0, 32),
      kind: boundedText(item?.kind || "preference", "候选类型", 60),
      summary: boundedText(item?.summary, "记忆候选", 10000),
    })) : [];
    const at = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.prepare("SELECT summary FROM daily_summaries WHERE day=? AND source=?").get(normalizedDay, normalizedSource);
      const combinedSummary = existing?.summary && !replacesSummary ? `${existing.summary}\n\n${normalizedSummary}` : normalizedSummary;
      this.db.prepare("INSERT INTO daily_summaries (day, source, summary, source_turn_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, source) DO UPDATE SET summary=excluded.summary, source_turn_count=daily_summaries.source_turn_count+excluded.source_turn_count, updated_at=excluded.updated_at").run(normalizedDay, normalizedSource, combinedSummary, ids.length, at, at);
      const insert = this.db.prepare("INSERT OR IGNORE INTO memory_candidates (id, day, kind, summary, source_turn_ids, state, created_at, updated_at, source) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)");
      for (const item of normalizedCandidates) insert.run(item.id, normalizedDay, item.kind, item.summary, JSON.stringify(ids), at, at, scope);
      this.db.prepare(`UPDATE conversation_turns SET summary_day=? WHERE id IN (${ids.map(() => "?").join(",")}) AND summary_day IS NULL`).run(normalizedDay, ...ids);
      this.db.prepare("INSERT INTO memory_digest_runs (idempotency_key, source, day, input_digest, source_turn_count, completed_at) VALUES (?, ?, ?, ?, ?, ?)").run(digestKey, normalizedSource, normalizedDay, digest, ids.length, at);
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, day: normalizedDay, turns: ids.length, candidates: normalizedCandidates.length, source: scope, inputDigest: digest };
  }

  projectionItems() {
    const dailySummaries = this.db.prepare("SELECT day, source, summary, source_turn_count AS sourceTurnCount, updated_at AS updatedAt FROM daily_summaries ORDER BY day ASC, source ASC").all();
    const memories = this.db.prepare("SELECT id, day, kind, summary, source, updated_at AS updatedAt FROM memory_candidates WHERE state='accepted' ORDER BY day ASC, updated_at ASC").all();
    return { dailySummaries, memories, journals: this.journalProjectionItems() };
  }

  dailySummaryFor({ source, day }) {
    return this.db.prepare("SELECT summary FROM daily_summaries WHERE source=? AND day=?").get(boundedSource(source), String(day))?.summary || "";
  }

  recentAcceptedContext({ limit = 12, maxCharacters = 4000 } = {}) {
    const rows = this.db.prepare("SELECT id, day, kind, summary, source FROM memory_candidates WHERE state='accepted' ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Math.min(30, Number(limit) || 12)));
    let used = 0;
    const result = [];
    for (const row of rows) {
      const summary = String(row.summary || "").trim();
      if (!summary || used + summary.length > maxCharacters) continue;
      result.push({ id: row.id, day: row.day, kind: row.kind, source: boundedSource(row.source, { mixed: true }), summary });
      used += summary.length;
    }
    return result;
  }

  recentCompanionContext({ since = this.now() - 86400000, limit = 80 } = {}) {
    return this.db.prepare("SELECT role, content, created_at AS createdAt FROM conversation_turns WHERE source='companion' AND created_at>=? AND created_at<=? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(Math.max(0, Number(since) || 0), this.now(), Math.max(1, Math.min(80, Number(limit) || 80))).reverse();
  }

  // Main-only retrieval: vectors are refreshed from accepted SQLite content,
  // so corrections/deletions apply on the very next conversational question.
  reviewedContextForQuery(query) {
    const accepted = this.db.prepare("SELECT id, summary, updated_at FROM memory_candidates WHERE state='accepted' ORDER BY id").all();
    const signature = createHash("sha256").update(JSON.stringify(accepted)).digest("hex");
    if (this.contextIndexSignature !== signature) {
      this.rebuildLocalIndex();
      this.contextIndexSignature = signature;
    }
    const relevant = this.searchLongTermMemory({ query, limit: 8 }).filter((row) => row.score >= 0.12).map((row) => ({ ...row, summary: row.content }));
    const selected = new Map();
    let remaining = 4000;
    for (const row of [...relevant, ...this.recentAcceptedContext({ limit: 4 })]) {
      if (selected.has(row.id)) continue;
      const summary = String(row.summary).slice(0, Math.min(500, remaining));
      if (!summary) break;
      selected.set(row.id, { day: row.day, kind: row.kind, source: row.source, summary });
      remaining -= summary.length;
    }
    return [...selected.values()];
  }

  earlierCompanionContextForQuery(query, { before = this.now() + 1, limit = 6 } = {}) {
    // Query only today's/recent 24h own companion text, never dictation, files,
    // or other applications. Long conversations stay stored even off-prompt.
    const rows = this.db.prepare("SELECT role, content, created_at AS createdAt FROM conversation_turns WHERE source='companion' AND created_at>=? AND created_at<? ORDER BY created_at ASC, rowid ASC")
      .all(this.now() - 86400000, Math.min(before, this.now() + 1));
    const target = embed(String(query || "").slice(0, 500));
    const hits = rows.map((row, index) => ({ index, score: cosine(target, embed(row.content)) })).filter((hit) => hit.score >= 0.18).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(6, Number(limit) || 6)));
    const indexes = new Set();
    for (const hit of hits) {
      if (hit.index > 0 && rows[hit.index].role === "assistant") indexes.add(hit.index - 1);
      indexes.add(hit.index);
      if (rows[hit.index].role === "user" && rows[hit.index + 1]?.role === "assistant") indexes.add(hit.index + 1);
    }
    return [...indexes].sort((a, b) => a - b).map((index) => ({ ...rows[index], content: rows[index].content.slice(0, 700) })).slice(0, 12);
  }

  ensureActiveWorkday(timestamp = this.now()) {
    const calendarDay = localDayAt(timestamp);
    const current = this.db.prepare("SELECT active_day AS day, period_start AS periodStart, last_close_calendar_day AS lastCloseCalendarDay FROM memory_workday_state WHERE id=1").get();
    if (!current) throw new Error("memory-workday-state-missing");
    if (current.day < calendarDay) {
      const [year, month, date] = calendarDay.split("-").map(Number);
      const periodStart = new Date(year, month - 1, date).getTime();
      this.db.prepare("UPDATE memory_workday_state SET active_day=?, period_start=?, updated_at=? WHERE id=1").run(calendarDay, periodStart, this.now());
      return { day: calendarDay, periodStart, lastCloseCalendarDay: current.lastCloseCalendarDay || "" };
    }
    return current;
  }

  workdayStatus() {
    const active = this.ensureActiveWorkday(this.now());
    const latest = this.db.prepare("SELECT day, status, period_start AS periodStart, period_end AS periodEnd, source_turn_count AS sourceTurnCount, completed_at AS completedAt FROM memory_daily_journals ORDER BY day DESC LIMIT 1").get() || null;
    return {
      active,
      latest,
      hourlySummaries: Number(this.db.prepare("SELECT COUNT(*) AS value FROM memory_hourly_summaries").get()?.value || 0),
      completedJournals: Number(this.db.prepare("SELECT COUNT(*) AS value FROM memory_daily_journals WHERE status='completed'").get()?.value || 0),
      pendingJournalSync: Number(this.db.prepare("SELECT COUNT(*) AS value FROM memory_journal_outbox WHERE status IN ('pending','failed')").get()?.value || 0),
      acceptedJournalSync: Number(this.db.prepare("SELECT COUNT(*) AS value FROM memory_journal_outbox WHERE status='accepted'").get()?.value || 0),
    };
  }

  beginWorkdayClose({ at = this.now(), manual = false } = {}) {
    const timestamp = Math.max(0, Number(at) || this.now());
    const calendarDay = localDayAt(timestamp);
    const current = this.ensureActiveWorkday(timestamp);
    if (manual && current.lastCloseCalendarDay === calendarDay) return { ok: true, skipped: true, reason: "memory-workday-already-closed-today", day: this.db.prepare("SELECT day FROM memory_daily_journals ORDER BY period_end DESC LIMIT 1").get()?.day || current.day };
    const existing = this.db.prepare("SELECT day, period_start AS periodStart, period_end AS periodEnd, status FROM memory_daily_journals WHERE day=?").get(current.day);
    if (existing?.status === "completed") return { ok: true, skipped: true, reason: "memory-workday-already-completed", ...existing };
    if (existing?.status === "closing") return { ok: true, resumed: true, ...existing };
    const [year, month, date] = current.day.split("-").map(Number);
    const nextDay = localDayAt(new Date(year, month - 1, date + 1).getTime());
    const nextActiveDay = nextDay > calendarDay ? nextDay : localDayAt(new Date(timestamp + 86400000).getTime());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO memory_daily_journals (day, period_start, period_end, status, created_at, updated_at) VALUES (?, ?, ?, 'closing', ?, ?)").run(current.day, current.periodStart, timestamp, this.now(), this.now());
      this.db.prepare("UPDATE memory_workday_state SET active_day=?, period_start=?, last_close_calendar_day=?, updated_at=? WHERE id=1").run(nextActiveDay, timestamp, calendarDay, this.now());
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, day: current.day, periodStart: current.periodStart, periodEnd: timestamp, status: "closing" };
  }

  beginHistoricalClose(day) {
    const normalizedDay = String(day || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) throw new Error("memory-day-invalid");
    const existing = this.dailyJournal(normalizedDay);
    if (existing) return { ok: true, resumed: existing.status === "closing", skipped: existing.status === "completed", ...existing };
    const range = this.db.prepare("SELECT MIN(created_at) AS periodStart, MAX(created_at) AS periodEnd FROM conversation_turns WHERE workday_day=?").get(normalizedDay);
    const [year, month, date] = normalizedDay.split("-").map(Number);
    const periodStart = Number(range?.periodStart) || new Date(year, month - 1, date).getTime();
    const periodEnd = Number(range?.periodEnd) || new Date(year, month - 1, date + 1).getTime() - 1;
    const at = this.now();
    this.db.prepare("INSERT INTO memory_daily_journals (day, period_start, period_end, status, created_at, updated_at) VALUES (?, ?, ?, 'closing', ?, ?)").run(normalizedDay, periodStart, periodEnd, at, at);
    this.bumpRevision();
    return { ok: true, day: normalizedDay, periodStart, periodEnd, status: "closing" };
  }

  journalDaysPending({ beforeDay = "9999-12-31" } = {}) {
    const fromTurns = this.db.prepare("SELECT DISTINCT workday_day AS day FROM conversation_turns WHERE workday_day<? ORDER BY workday_day").all(String(beforeDay));
    const closing = this.db.prepare("SELECT day FROM memory_daily_journals WHERE status='closing' ORDER BY day").all();
    return [...new Set([...closing, ...fromTurns].map((row) => row.day).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !this.db.prepare("SELECT 1 FROM memory_daily_journals WHERE day=? AND status='completed'").get(day)))].sort();
  }

  turnsForWorkday({ day, sources = ["companion", "dictation"], before = Number.MAX_SAFE_INTEGER } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) throw new Error("memory-day-invalid");
    const selected = [...new Set(sources.map((source) => boundedSource(source)))];
    if (!selected.length) return [];
    const placeholders = selected.map(() => "?").join(",");
    return this.db.prepare(`SELECT id, session_id AS sessionId, role, content, source, created_at AS createdAt, workday_day AS workdayDay FROM conversation_turns WHERE workday_day=? AND source IN (${placeholders}) AND created_at<=? ORDER BY created_at ASC, rowid ASC`).all(day, ...selected, Math.max(0, Number(before) || Number.MAX_SAFE_INTEGER));
  }

  hourlySummariesForDay(day) {
    return this.db.prepare("SELECT hour_key AS hourKey, period_start AS periodStart, period_end AS periodEnd, input_digest AS inputDigest, summary, source_turn_ids AS sourceTurnIds FROM memory_hourly_summaries WHERE workday_day=? ORDER BY period_end ASC").all(String(day)).map((row) => ({ ...row, sourceTurnIds: JSON.parse(row.sourceTurnIds) }));
  }

  saveHourlySummary({ day, hourKey, periodStart, periodEnd, inputDigest, summary, turnIds } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(String(hourKey || "")) || !/^[a-f0-9]{64}$/.test(String(inputDigest || ""))) throw new Error("memory-hourly-summary-invalid");
    const text = boundedText(summary, "小时摘要", 30000);
    const ids = Array.isArray(turnIds) ? turnIds.map(String).filter((id) => /^[a-f0-9-]{16,64}$/i.test(id)).slice(0, 500) : [];
    const at = this.now();
    this.db.prepare("INSERT INTO memory_hourly_summaries (workday_day, hour_key, period_start, period_end, input_digest, summary, source_turn_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workday_day, hour_key) DO UPDATE SET period_start=excluded.period_start, period_end=excluded.period_end, input_digest=excluded.input_digest, summary=excluded.summary, source_turn_ids=excluded.source_turn_ids, updated_at=excluded.updated_at").run(day, hourKey, periodStart, periodEnd, inputDigest, text, JSON.stringify(ids), at, at);
    this.bumpRevision();
    return { ok: true, day, hourKey, turns: ids.length };
  }

  dailyJournal(day) {
    const row = this.db.prepare("SELECT day, period_start AS periodStart, period_end AS periodEnd, status, work_markdown AS workMarkdown, personal_markdown AS personalMarkdown, combined_markdown AS combinedMarkdown, input_digest AS inputDigest, source_turn_count AS sourceTurnCount, source_counts_json AS sourceCountsJson, completed_at AS completedAt FROM memory_daily_journals WHERE day=?").get(String(day));
    if (!row) return null;
    let sourceCounts = {};
    try { sourceCounts = JSON.parse(row.sourceCountsJson || "{}"); } catch { /* migration-safe empty provenance */ }
    delete row.sourceCountsJson;
    return { ...row, sourceCounts };
  }

  saveDailyJournal({ day, periodStart, periodEnd, inputDigest, workMarkdown, personalMarkdown, combinedMarkdown, sourceCounts = {}, turnIds = [], candidates = [] } = {}) {
    const current = this.dailyJournal(day);
    if (!current || current.status !== "closing") throw new Error("memory-workday-not-closing");
    if (!/^[a-f0-9]{64}$/.test(String(inputDigest || ""))) throw new Error("memory-input-digest-invalid");
    const work = boundedText(workMarkdown, "工作总结", 100000);
    const personal = boundedText(personalMarkdown, "个人记忆", 100000);
    const combined = boundedText(combinedMarkdown, "综合日记", 200000);
    const ids = [...new Set(turnIds.map(String).filter((id) => /^[a-f0-9-]{16,64}$/i.test(id)))];
    const normalizedSourceCounts = Object.fromEntries(["companion", "dictation"].map((source) => [source, Math.max(0, Number(sourceCounts?.[source]) || 0)]));
    const at = this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE memory_daily_journals SET period_start=?, period_end=?, status='completed', work_markdown=?, personal_markdown=?, combined_markdown=?, input_digest=?, source_turn_count=?, source_counts_json=?, updated_at=?, completed_at=? WHERE day=? AND status='closing'").run(periodStart, periodEnd, work, personal, combined, inputDigest, ids.length, JSON.stringify(normalizedSourceCounts), at, at, day);
      const insert = this.db.prepare("INSERT OR IGNORE INTO memory_candidates (id, day, kind, summary, source_turn_ids, state, created_at, updated_at, source) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 'mixed')");
      for (const item of candidates.slice(0, 40)) {
        const summary = String(item?.summary || "").trim().slice(0, 10000);
        if (!summary) continue;
        const kind = String(item?.kind || "fact").slice(0, 60);
        const id = createHash("sha256").update(JSON.stringify([day, inputDigest, kind, summary])).digest("hex").slice(0, 32);
        insert.run(id, day, kind, summary, JSON.stringify(ids.slice(0, 200)), at, at);
      }
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return this.dailyJournal(day);
  }

  queueJournalDelivery({ day, memoryClass, projectId = null, payload, idempotencyKey } = {}) {
    if (!new Set(["work", "personal"]).has(memoryClass) || (memoryClass === "personal" && projectId)) throw new Error("memory-journal-class-invalid");
    if (!/^[\u0020-\u007e]{1,128}$/.test(String(idempotencyKey || ""))) throw new Error("memory-idempotency-key-invalid");
    const at = this.now();
    const id = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
    const serialized = JSON.stringify(payload);
    this.db.prepare("INSERT INTO memory_journal_outbox (id, day, memory_class, project_id, payload_json, idempotency_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(day, memory_class) DO NOTHING").run(id, day, memoryClass, projectId || null, serialized, idempotencyKey, at, at);
    this.bumpRevision();
    return { ok: true, id, day, memoryClass };
  }

  pendingJournalDeliveries({ limit = 4, at = this.now() } = {}) {
    return this.db.prepare("SELECT id, day, memory_class AS memoryClass, project_id AS projectId, payload_json AS payloadJson, idempotency_key AS idempotencyKey, attempts FROM memory_journal_outbox WHERE status IN ('pending','failed') AND next_attempt_at<=? ORDER BY day, memory_class LIMIT ?").all(Number(at), Math.max(1, Math.min(20, Number(limit) || 4))).map((row) => ({ ...row, payload: JSON.parse(row.payloadJson) }));
  }

  markJournalDelivery(id, { ok, submissionId = "", reason = "", retryAt = 0 } = {}) {
    const normalizedId = boundedId(id, "投递 ID");
    const at = this.now();
    this.db.prepare("UPDATE memory_journal_outbox SET status=?, attempts=attempts+1, submission_id=?, last_error=?, next_attempt_at=?, updated_at=?, accepted_at=? WHERE id=?").run(ok ? "accepted" : "failed", ok ? String(submissionId || "") : "", ok ? "" : String(reason || "knowledgeos-submit-failed").slice(0, 80), ok ? 0 : Math.max(at, Number(retryAt) || at + 300000), at, ok ? at : null, normalizedId);
    this.bumpRevision();
    return { ok: true };
  }

  journalProjectionItems() {
    return this.db.prepare("SELECT day FROM memory_daily_journals WHERE status='completed' ORDER BY day").all().map((row) => this.dailyJournal(row.day));
  }

  cleanupExpiredRaw({ retentionDays = 20, at = this.now(), requireRemoteAccepted = false } = {}) {
    const days = Math.max(1, Math.min(365, Number(retentionDays) || 20));
    const cutoff = Number(at) - days * 86400000;
    const eligible = this.db.prepare("SELECT t.id, t.source_event_id AS sourceEventId FROM conversation_turns t JOIN memory_daily_journals j ON j.day=t.workday_day AND j.status='completed' WHERE t.created_at<? AND (NOT ? OR ((SELECT COUNT(*) FROM memory_journal_outbox o WHERE o.day=j.day AND o.status='accepted')=2))").all(cutoff, requireRemoteAccepted ? 1 : 0);
    if (!eligible.length) return { ok: true, removed: 0, retentionDays: days };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const remove = this.db.prepare("DELETE FROM conversation_turns WHERE id=?");
      const removeOutbox = this.db.prepare("DELETE FROM companion_memory_outbox WHERE event_id=?");
      for (const row of eligible) { if (row.sourceEventId) removeOutbox.run(row.sourceEventId); remove.run(row.id); }
      this.bumpRevision();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
    return { ok: true, removed: eligible.length, retentionDays: days };
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
      const desiredIds = new Set(desired.map((item) => item.id));
      let removed = 0;
      const remove = this.db.prepare("DELETE FROM memory_chunks WHERE id=?");
      // A content correction changes the chunk ID but retains candidate/ordinal.
      // Remove replaced rows first to avoid the unique candidate/ordinal clash.
      for (const id of existing.keys()) if (!desiredIds.has(id)) { remove.run(id); removed += 1; }
      for (const item of desired) {
        desiredIds.add(item.id);
        const current = existing.get(item.id);
        if (current?.contentHash === item.contentHash && current.model === LOCAL_EMBEDDING_MODEL && current.dimensions === LOCAL_EMBEDDING_DIMENSIONS) { reused += 1; continue; }
        upsertChunk.run(item.id, item.candidateId, item.ordinal, item.content, item.contentHash, at);
        upsertVector.run(item.id, LOCAL_EMBEDDING_MODEL, LOCAL_EMBEDDING_DIMENSIONS, encode(embed(item.content)), at);
        indexed += 1;
      }
      this.bumpRevision();
      this.db.exec("COMMIT");
      return { ok: true, model: LOCAL_EMBEDDING_MODEL, memories: memories.length, chunks: desired.length, indexed, reused, removed };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
  }

  searchLongTermMemory({ query, limit = 8, source = "all" } = {}) {
    const text = String(query || "").trim().slice(0, 500);
    if (!text) return [];
    const target = embed(text);
    const boundedLimit = Math.max(1, Math.min(20, Number(limit) || 8));
    const normalizedSource = source === "all" ? "all" : boundedSource(source, { mixed: true });
    const rows = this.db.prepare("SELECT c.id AS chunkId, c.candidate_id AS candidateId, c.content, m.day, m.kind, m.source, e.dimensions, e.vector FROM memory_chunks c JOIN memory_chunk_embeddings e ON e.chunk_id=c.id JOIN memory_candidates m ON m.id=c.candidate_id WHERE m.state='accepted' AND (?='all' OR m.source=? OR m.source='mixed')").all(normalizedSource, normalizedSource);
    const terms = text.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.map((row) => {
      const content = String(row.content);
      const keyword = terms.length ? terms.filter((term) => content.toLocaleLowerCase().includes(term)).length / terms.length : 0;
      const vector = cosine(target, decode(row.vector, row.dimensions));
      return { id: row.candidateId, chunkId: row.chunkId, day: row.day, kind: row.kind, source: boundedSource(row.source, { mixed: true }), content, score: Math.round((Math.max(0, vector) * 0.75 + keyword * 0.25) * 10000) / 10000 };
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
      const { day, source } = parseDailyItemId(id);
      const row = this.db.prepare("SELECT updated_at, summary FROM daily_summaries WHERE day=? AND source=?").get(day, source);
      return row ? `daily:${source}:${day}:${row.updated_at}:${createHash("sha256").update(row.summary).digest("hex")}` : null;
    }
    const candidateId = boundedId(id);
    const row = this.db.prepare("SELECT updated_at, state, summary FROM memory_candidates WHERE id=?").get(candidateId);
    return row ? `candidate:${candidateId}:${row.updated_at}:${row.state}:${createHash("sha256").update(row.summary).digest("hex")}` : null;
  }

  deleteItem({ type, id } = {}) {
    if (!ITEM_TYPES.has(type)) throw new Error("memory-item-type-invalid");
    if (type === "daily") {
      const { day, source } = parseDailyItemId(id);
      const deleted = this.db.prepare("DELETE FROM daily_summaries WHERE day=? AND source=?").run(day, source).changes === 1;
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
      this.db.exec("DELETE FROM memory_chunk_embeddings; DELETE FROM memory_chunks; DELETE FROM memory_embeddings; DELETE FROM memory_candidates; DELETE FROM daily_summaries; DELETE FROM conversation_turns; DELETE FROM companion_memory_outbox; DELETE FROM memory_digest_runs; DELETE FROM memory_hourly_summaries; DELETE FROM memory_daily_journals; DELETE FROM memory_journal_outbox;");
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
    const dailySummaries = this.db.prepare("SELECT day, source, summary FROM daily_summaries ORDER BY day ASC, source ASC").all().map((item) => ({ day: item.day, source: item.source, summary: item.summary }));
    const longTermMemories = this.db.prepare("SELECT day, source, kind, summary FROM memory_candidates WHERE state='accepted' ORDER BY day ASC, source ASC, updated_at ASC").all().map((item) => ({ day: item.day, source: item.source, kind: item.kind, summary: item.summary }));
    const dailyJournals = this.journalProjectionItems().map(({ inputDigest, ...item }) => item);
    return { schema: "deskmate.memory.export.v2", exportedAt: instant.toISOString(), dailySummaries, dailyJournals, longTermMemories };
  }

  status() {
    const scalar = (sql) => Number(this.db.prepare(sql).get()?.value || 0);
    const sourceCounts = {};
    for (const source of TURN_SOURCES) sourceCounts[source] = {
      turns: Number(this.db.prepare("SELECT COUNT(*) AS value FROM conversation_turns WHERE source=?").get(source)?.value || 0),
      unprocessed: Number(this.db.prepare("SELECT COUNT(*) AS value FROM conversation_turns WHERE source=? AND summary_day IS NULL").get(source)?.value || 0),
    };
    return {
      ready: true,
      storage: "sqlite-wal",
      turns: scalar("SELECT COUNT(*) AS value FROM conversation_turns"),
      dailySummaries: scalar("SELECT COUNT(*) AS value FROM daily_summaries"),
      pendingCandidates: scalar("SELECT COUNT(*) AS value FROM memory_candidates WHERE state='pending'"),
      longTermMemories: scalar("SELECT COUNT(*) AS value FROM memory_candidates WHERE state='accepted'"),
      embeddings: scalar("SELECT COUNT(*) AS value FROM memory_chunk_embeddings") + scalar("SELECT COUNT(*) AS value FROM memory_embeddings"),
      unprocessedTurns: scalar("SELECT COUNT(*) AS value FROM conversation_turns WHERE summary_day IS NULL"),
      unprocessedDays: new Set([...TURN_SOURCES].flatMap((source) => this.unprocessedDays({ source }))).size,
      indexedChunks: scalar("SELECT COUNT(*) AS value FROM memory_chunk_embeddings"),
      sourceCounts,
    };
  }

  list({ filter = "all", source = "all", query = "", limit = 100 } = {}) {
    const normalizedQuery = String(query || "").trim().slice(0, 200);
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const like = `%${normalizedQuery.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
    const normalizedSource = source === "all" ? "all" : boundedSource(source, { mixed: true });
    const summaries = ["all", "daily"].includes(filter) ? this.db.prepare("SELECT source || ':' || day AS id, 'daily' AS type, day, source, summary AS content, updated_at AS updatedAt FROM daily_summaries WHERE (? = '' OR summary LIKE ? ESCAPE '\\') AND (?='all' OR source=?) ORDER BY day DESC, source ASC LIMIT ?").all(normalizedQuery, like, normalizedSource, normalizedSource, boundedLimit) : [];
    const journals = ["all", "daily"].includes(filter) && ["all", "mixed"].includes(normalizedSource) ? this.db.prepare("SELECT 'journal:' || day AS id, 'journal' AS type, day, 'mixed' AS source, combined_markdown AS content, updated_at AS updatedAt FROM memory_daily_journals WHERE status='completed' AND (?='' OR combined_markdown LIKE ? ESCAPE '\\') ORDER BY day DESC LIMIT ?").all(normalizedQuery, like, boundedLimit) : [];
    const states = filter === "long-term" ? ["accepted"] : filter === "candidates" ? ["pending"] : ["pending", "accepted", "rejected"];
    const placeholders = states.map(() => "?").join(",");
    const candidates = ["all", "candidates", "long-term"].includes(filter) ? this.db.prepare(`SELECT id, 'candidate' AS type, day, kind, summary AS content, state, source, updated_at AS updatedAt FROM memory_candidates WHERE state IN (${placeholders}) AND (? = '' OR summary LIKE ? ESCAPE '\\') AND (?='all' OR source=? OR source='mixed') ORDER BY updated_at DESC LIMIT ?`).all(...states, normalizedQuery, like, normalizedSource, normalizedSource, boundedLimit) : [];
    return [...journals, ...summaries, ...candidates].sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, boundedLimit);
  }

  listTurns({ source = "all", query = "", limit = 100 } = {}) {
    const normalizedQuery = String(query || "").trim().slice(0, 200);
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const like = `%${normalizedQuery.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
    const normalizedSource = source === "all" ? "all" : boundedSource(source);
    return this.db.prepare("SELECT id, 'turn' AS type, source, role, content, created_at AS createdAt FROM conversation_turns WHERE (?='' OR content LIKE ? ESCAPE '\\') AND (?='all' OR source=?) ORDER BY created_at DESC LIMIT ?")
      .all(normalizedQuery, like, normalizedSource, normalizedSource, boundedLimit)
      .map((item) => ({ ...item, day: localDayAt(item.createdAt) }));
  }

  close() { this.db.close(); }
}

module.exports = { CompanionMemoryStore, localDayAt };
