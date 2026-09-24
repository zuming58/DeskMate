// Explicitly authorized offline maintenance. Never logs raw memory or credentials.
const { app, safeStorage } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { CompanionMemoryPolicyStore } = require('../electron/companion-memory-policy.cjs');
const { MemoryCurationService } = require('../electron/memory-curation.cjs');
const { createSecureAiServiceStore } = require('../electron/secure-ai-services.cjs');
const { createSecureBailianStore } = require('../electron/secure-bailian.cjs');
const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1];
const root = arg('--user-data'), reportFile = arg('--report');
if (!args.includes('--offline-confirmed') || !args.includes('--model-consent-confirmed') || !path.isAbsolute(root || '') || !path.isAbsolute(reportFile || '')) throw Error('maintenance-arguments-invalid');
app.setPath('userData', root); app.disableHardwareAcceleration();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
app.whenReady().then(async () => {
  let store, original;
  const report = { at: new Date().toISOString(), state: 'starting', batches: [] };
  const write = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  try {
    const processes = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq DeskMate.exe', '/FO', 'CSV', '/NH'], { windowsHide: true, encoding: 'utf8' });
    if (/"DeskMate.exe"/i.test(processes)) throw Error('memory-app-still-running');
    const backupDir = path.join(root, 'maintenance-backups', `t71-${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    const db = new DatabaseSync(path.join(root, 'companion-memory.sqlite3'), { readOnly: true });
    try { db.prepare('VACUUM INTO ?').run(path.join(backupDir, 'companion-memory.sqlite3')); } finally { db.close(); }
    report.backup = path.basename(backupDir); report.state = 'backed-up'; write();
    original = new DatabaseSync(path.join(backupDir, 'companion-memory.sqlite3'), { readOnly: true });
    store = new CompanionMemoryStore({ userDataPath: root });
    report.before = { ...store.curationStatus(), memories: store.status().longTermMemories, turns: store.status().turns };
    store.setCurationEnabled({ enabled: true, confirmed: true });
    // Versioned repair of this release's overly literal numeric guard only.
    // Original rows and human decisions stay unchanged; semantics go through
    // the configured model AND the verifier again, never direct promotion.
    if (args.includes('--retry-numeric-checks')) report.requeuedNumericChecks = Number(store.db.prepare("DELETE FROM memory_curation_items WHERE outcome='review' AND origin='automatic' AND reason=?").run('数字或时间缺少对应原话，请核对').changes);
    const secure = createSecureAiServiceStore({ safeStorage, userDataPath: root });
    const bailian = createSecureBailianStore({ safeStorage, userDataPath: root });
    const service = new MemoryCurationService({ store, policyStore: new CompanionMemoryPolicyStore({ userDataPath: root }), loadSecret: () => secure.status().text.configured ? secure.loadTextSecret() : { ...bailian.loadSecret(), provider: 'bailian' } });
    report.state = 'curating'; write();
    report.result = await service.run({ force: true, maxBatches: 20, onBatch: counts => { report.batches.push(counts); report.current = service.status(); write(); } });
    for (const table of ['conversation_turns', 'daily_summaries', 'memory_daily_journals', 'memory_journal_outbox']) {
      assert.equal(hash(store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), hash(original.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()), `${table} preservation`);
    }
    for (const row of original.prepare('SELECT * FROM memory_candidates').all()) assert.equal(hash(store.db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(row.id)), hash(row), 'candidate preservation');
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    report.originalsPreserved = true; report.sqliteIntegrity = true;
    report.after = { ...store.curationStatus(), memories: store.status().longTermMemories, turns: store.status().turns };
    report.state = report.result.ok ? 'finished' : 'partial';
  } catch (error) { report.state = 'failed'; report.reason = /^(memory|text-model)-[a-z0-9-]+$/.test(error?.message || '') ? error.message : 'maintenance-failed'; }
  finally { original?.close(); store?.close(); write(); app.exit(report.state === 'finished' ? 0 : 1); }
});
