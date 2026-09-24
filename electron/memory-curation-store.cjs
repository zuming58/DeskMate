const { createHash } = require('node:crypto');
const { fingerprint } = require('./memory-candidate-review.cjs');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pendingSql = "state='pending' AND NOT EXISTS(SELECT 1 FROM memory_curation_items ci WHERE ci.candidate_id=memory_candidates.id AND ci.outcome<>'review')";

function initializeCurationStore(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS memory_curation_items (
    candidate_id TEXT PRIMARY KEY REFERENCES memory_candidates(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    group_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('remember','duplicate','archive','review')),
    memory_id TEXT REFERENCES memory_candidates(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    kind TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    origin TEXT NOT NULL CHECK(origin IN ('automatic','human')),
    processed_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS idx_curation_group ON memory_curation_items(group_id);
  CREATE INDEX IF NOT EXISTS idx_curation_memory ON memory_curation_items(memory_id);`);
}

const methods = {
  curationMeta(key) { return Number(this.db.prepare('SELECT value FROM companion_memory_meta WHERE key=?').get(`curation:${key}`)?.value || 0); },
  setCurationMeta(key, value) { this.db.prepare('INSERT OR REPLACE INTO companion_memory_meta(key,value) VALUES(?,?)').run(`curation:${key}`, Math.max(0, Math.trunc(Number(value) || 0))); },
  setCurationEnabled({ enabled, confirmed = false } = {}) {
    if (typeof enabled !== 'boolean' || (enabled && confirmed !== true)) return { ok: false, reason: 'memory-curation-consent-required' };
    this.setCurationMeta('enabled', enabled ? 1 : 0);
    this.setCurationMeta('consentRevision', this.curationMeta('consentRevision') + 1);
    if (enabled) this.setCurationMeta('consentAt', this.now());
    this.bumpRevision(); return { ok: true, ...this.curationStatus() };
  },
  curationStatus() {
    const scalar = sql => Number(this.db.prepare(sql).get()?.n || 0);
    return {
      enabled: this.curationMeta('enabled') === 1, consentAt: this.curationMeta('consentAt'),
      nextRetryAt: this.curationMeta('nextRetryAt'), failures: this.curationMeta('failures'), lastRunAt: this.curationMeta('lastRunAt'),
      pending: scalar("SELECT COUNT(*) n FROM memory_candidates c WHERE c.state='pending' AND NOT EXISTS(SELECT 1 FROM memory_curation_items r WHERE r.candidate_id=c.id)"),
      questions: scalar("SELECT COUNT(DISTINCT r.group_id) n FROM memory_curation_items r JOIN memory_candidates c ON c.id=r.candidate_id WHERE r.outcome='review' AND c.state='pending'"),
      archived: scalar("SELECT COUNT(*) n FROM memory_curation_items WHERE outcome IN ('archive','duplicate')"),
      processed: scalar('SELECT COUNT(*) n FROM memory_curation_items'),
      automatic: scalar("SELECT COUNT(DISTINCT r.memory_id) n FROM memory_curation_items r JOIN memory_candidates c ON c.id=r.memory_id WHERE r.outcome='remember' AND r.origin='automatic' AND c.state='accepted'"),
    };
  },
  curationAccepted() {
    return this.db.prepare("SELECT id,day,kind,summary,source,updated_at AS updatedAt FROM memory_candidates WHERE state='accepted' ORDER BY id").all();
  },
  curationCandidates({ sources = ['companion', 'dictation'], limit = 40 } = {}) {
    const allowed = new Set(sources);
    return this.db.prepare("SELECT id,day,kind,summary AS content,source,source_turn_ids AS sourceTurnIds FROM memory_candidates c WHERE c.state='pending' AND NOT EXISTS(SELECT 1 FROM memory_curation_items r WHERE r.candidate_id=c.id) ORDER BY day,id").all()
      .filter(item => item.source === 'mixed' ? allowed.has('companion') && allowed.has('dictation') : allowed.has(item.source))
      .slice(0, Math.max(1, Math.min(40, Number(limit) || 40)))
      .map(item => ({ ...item, sourceTurnIds: JSON.parse(item.sourceTurnIds) }));
  },
  curationSnapshot(items) {
    const evidence = new Map(); let characters = 0;
    const normalized = items.map(item => ({ ...item, fingerprint: fingerprint(item), evidenceIds: [] }));
    // Select relevant user turns from the candidate's actual recorded provenance,
    // not arbitrary history. Sharing a day's evidence does not prove a statement.
    for (const item of normalized) {
      const ids = item.sourceTurnIds.slice(0, 200);
      if (!ids.length) continue;
      const grams = new Set((item.content.toLowerCase().match(/[a-z0-9_-]{2,}|[\u3400-\u9fff]{2}/g) || []));
      const turns = this.db.prepare(`SELECT id,role,source,content,created_at AS createdAt FROM conversation_turns WHERE role='user' AND id IN (${ids.map(() => '?').join(',')})`).all(...ids);
      turns.sort((a, b) => [...grams].filter(g => b.content.toLowerCase().includes(g)).length - [...grams].filter(g => a.content.toLowerCase().includes(g)).length);
      for (const turn of turns.slice(0, 5)) {
        // Do not truncate a user turn into a false statement. Oversize evidence
        // is omitted; the model must archive or ask, never invent missing proof.
        if (turn.content.length > 5000) continue;
        if (!evidence.has(turn.id) && characters + turn.content.length > 24000) continue;
        if (!evidence.has(turn.id)) { evidence.set(turn.id, turn); characters += turn.content.length; }
        item.evidenceIds.push(turn.id);
      }
    }
    const accepted = this.curationAccepted();
    // A bounded context may omit unrelated memories, never claim exhaustive conflict detection.
    const terms = new Set(normalized.flatMap(item => item.content.toLowerCase().match(/[a-z0-9_-]{2,}|[\u3400-\u9fff]{2}/g) || []));
    let contextSize = 0;
    const existing = [...accepted].sort((a, b) => [...terms].filter(t => b.summary.toLowerCase().includes(t)).length - [...terms].filter(t => a.summary.toLowerCase().includes(t)).length).filter(item => {
      if (contextSize + item.summary.length > 18000) return false;
      contextSize += item.summary.length; return true;
    }).slice(0, 120);
    return { items: normalized, evidence: [...evidence.values()], existing, contextHash: hash(accepted), consentRevision: this.curationMeta('consentRevision') };
  },
  curationSnapshotCurrent(snapshot) {
    if (!this.curationMeta('enabled') || snapshot.consentRevision !== this.curationMeta('consentRevision') || snapshot.contextHash !== hash(this.curationAccepted())) return false;
    for (const item of snapshot.items) {
      const current = this.db.prepare("SELECT id,day,kind,summary AS content,source FROM memory_candidates WHERE id=? AND state='pending'").get(item.id);
      if (!current || fingerprint(current) !== item.fingerprint || this.db.prepare('SELECT 1 FROM memory_curation_items WHERE candidate_id=?').get(item.id)) return false;
    }
    for (const turn of snapshot.evidence) {
      const current = this.db.prepare('SELECT id,role,source,content,created_at AS createdAt FROM conversation_turns WHERE id=?').get(turn.id);
      if (!current || hash(current) !== hash(turn)) return false;
    }
    return true;
  },
  commitCuration(snapshot, groups, { origin = 'automatic' } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.curationSnapshotCurrent(snapshot)) { this.db.exec('ROLLBACK'); return { ok: false, reason: 'memory-curation-source-changed' }; }
      const items = new Map(snapshot.items.map(item => [item.id, item]));
      const counts = { remembered: 0, merged: 0, archived: 0, questions: 0 };
      for (const group of groups) {
        const groupId = hash(group.ids.map(id => [id, items.get(id).fingerprint]).sort());
        let memoryId = null, outcome = group.action;
        if (outcome === 'remember') {
          if (group.mergeIntoId) { memoryId = group.mergeIntoId; outcome = 'duplicate'; counts.merged += group.ids.length; }
          else {
            memoryId = hash(['curated-v1', groupId, group.summary]).slice(0, 32);
            const originals = group.ids.map(id => items.get(id));
            const day = originals.map(item => item.day).sort().at(-1);
            const sources = [...new Set(originals.map(item => item.source))];
            this.db.prepare("INSERT INTO memory_candidates(id,day,kind,summary,source_turn_ids,state,created_at,updated_at,source) VALUES(?,?,?,?,?,'accepted',?,?,?)")
              .run(memoryId, day, group.kind, group.summary, JSON.stringify([...new Set(group.evidence.map(e => e.turnId))]), this.now(), this.now(), sources.length === 1 ? sources[0] : 'mixed');
            counts.remembered++;
          }
        } else if (outcome === 'review') counts.questions++;
        else counts.archived += group.ids.length;
        for (const id of group.ids) this.db.prepare('INSERT INTO memory_curation_items(candidate_id,fingerprint,group_id,outcome,memory_id,summary,kind,reason,evidence_json,origin,processed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, items.get(id).fingerprint, groupId, outcome, memoryId, group.summary, group.kind, group.reason, JSON.stringify({ quotes: group.evidence, conflicts: group.conflictIds || [] }), origin, this.now());
      }
      this.setCurationMeta('lastRunAt', this.now()); this.setCurationMeta('failures', 0); this.setCurationMeta('nextRetryAt', 0);
      this.bumpRevision(); this.db.exec('COMMIT'); return { ok: true, processed: snapshot.items.length, ...counts };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  },
  curationQuestions() {
    const rows = this.db.prepare("SELECT r.*, c.day,c.summary AS original FROM memory_curation_items r JOIN memory_candidates c ON c.id=r.candidate_id WHERE r.outcome='review' AND c.state='pending' ORDER BY r.processed_at,r.group_id,c.id").all();
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.group_id)) groups.set(row.group_id, { id: row.group_id, summary: row.summary, reason: row.reason, kind: row.kind, originals: [], conflicts: JSON.parse(row.evidence_json).conflicts || [] });
      groups.get(row.group_id).originals.push({ id: row.candidate_id, fingerprint: row.fingerprint, content: row.original, day: row.day });
    }
    const accepted = new Map(this.curationAccepted().map(item => [item.id, item]));
    return [...groups.values()].map(group => {
      const result = { ...group, conflicts: group.conflicts.map(id => accepted.get(id)).filter(Boolean) };
      return { ...result, fingerprint: hash(result) };
    });
  },
  resolveCurationQuestion({ id, fingerprint: expected, action, summary, confirmed, replaceConflicts } = {}) {
    if (confirmed !== true) return { ok: false, reason: 'memory-curation-selection-invalid' };
    if (!['accept', 'archive'].includes(action)) return { ok: false, reason: 'memory-curation-selection-invalid' };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const group = this.curationQuestions().find(item => item.id === id);
      if (!group || group.fingerprint !== expected) { this.db.exec('ROLLBACK'); return { ok: false, reason: 'memory-curation-source-changed' }; }
      if (action === 'accept' && group.conflicts.length && replaceConflicts !== true) { this.db.exec('ROLLBACK'); return { ok: false, reason: 'memory-curation-conflict-confirmation-required' }; }
      const text = String(summary ?? group.summary).trim();
      if (!text || text.length > 1200) throw Error('memory-curation-summary-invalid');
      let memoryId = null;
      if (action === 'accept') {
        for (const conflict of group.conflicts) this.db.prepare("UPDATE memory_candidates SET state='rejected',updated_at=? WHERE id=? AND state='accepted'").run(this.now(), conflict.id);
        memoryId = hash(['curated-human-v1', id, text]).slice(0, 32);
        const source = this.db.prepare('SELECT source FROM memory_candidates WHERE id=?').get(group.originals[0].id).source;
        this.db.prepare("INSERT INTO memory_candidates(id,day,kind,summary,source_turn_ids,state,created_at,updated_at,source) VALUES(?,?,?,?,?,'accepted',?,?,?)")
          .run(memoryId, group.originals.map(item => item.day).sort().at(-1), group.kind, text, '[]', this.now(), this.now(), source);
      }
      this.db.prepare("UPDATE memory_curation_items SET outcome=?,memory_id=?,summary=?,origin='human',processed_at=? WHERE group_id=?").run(action === 'accept' ? 'remember' : 'archive', memoryId, text, this.now(), id);
      this.bumpRevision(); this.db.exec('COMMIT'); return { ok: true };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  },
  invalidateCurationSource(id, { forgotten = false } = {}) {
    // A duplicate points at an independently supported memory; it does not own it.
    const memories = this.db.prepare("SELECT DISTINCT memory_id AS id FROM memory_curation_items WHERE candidate_id=? AND outcome='remember' AND memory_id IS NOT NULL AND (? OR origin='automatic')").all(id, forgotten ? 1 : 0);
    for (const memory of memories) this.db.prepare('DELETE FROM memory_candidates WHERE id=?').run(memory.id);
    // Other grouped originals remain archived after derived removal, preventing resurrection.
    if (!forgotten) this.db.prepare('DELETE FROM memory_curation_items WHERE candidate_id=?').run(id);
  },
};

module.exports = { initializeCurationStore, curationStoreMethods: methods, pendingSql, curationHash: hash };
