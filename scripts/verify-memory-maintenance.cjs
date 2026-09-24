// Compare only explicit snapshots. No content or identifiers are printed.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const [current, backup] = process.argv.slice(2);
assert(path.isAbsolute(current || '') && path.isAbsolute(backup || ''));
const a = new DatabaseSync(current, { readOnly: true }), b = new DatabaseSync(backup, { readOnly: true });
try {
  for (const db of [a, b]) assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  for (const table of ['conversation_turns', 'memory_candidates', 'memory_daily_journals', 'daily_summaries']) {
    assert.equal(digest(a.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()) === digest(b.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), true, `${table} must be preserved`);
  }
  const payloads = db => db.prepare('SELECT id,payload_json,idempotency_key FROM memory_journal_outbox ORDER BY id').all();
  assert.equal(digest(payloads(a)) === digest(payloads(b)), true, 'delivery content/identity must be preserved');
  console.log(JSON.stringify({ ok: true, sqliteIntegrity: true, originalsIdentical: true, outboxPayloadsIdentical: true }));
} finally { a.close(); b.close(); }
