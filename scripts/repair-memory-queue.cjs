// Authorized offline-profile maintenance only. No journal generation, no deletion,
// no candidate approval. Back up SQLite before opening the writable store.
const { app, safeStorage } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { CompanionMemoryPolicyStore } = require('../electron/companion-memory-policy.cjs');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const { MemoryJournalService } = require('../electron/memory-journal-service.cjs');
const { MemoryCandidateReviewService } = require('../electron/memory-candidate-review.cjs');
const { createSecureAiServiceStore } = require('../electron/secure-ai-services.cjs');
const { createSecureBailianStore } = require('../electron/secure-bailian.cjs');
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const root = arg('--user-data'), reportFile = arg('--report');
if (!args.includes('--offline-confirmed') || !path.isAbsolute(root || '') || !path.isAbsolute(reportFile || '')) throw Error('maintenance-arguments-invalid');
app.setPath('userData', root); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let store;
  const report = { at: new Date().toISOString(), state: 'starting', passes: [] };
  const write = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  try {
    const backupDir = path.join(root, 'maintenance-backups', `t70-${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    const db = new DatabaseSync(path.join(root, 'companion-memory.sqlite3'), { readOnly: true });
    try { db.prepare('VACUUM INTO ?').run(path.join(backupDir, 'companion-memory.sqlite3')); }
    finally { db.close(); }
    for (const name of ['knowledgeos-settings.json', 'companion-memory-policy.json']) {
      const file = path.join(root, name); if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupDir, name), fs.constants.COPYFILE_EXCL);
    }
    report.backup = path.basename(backupDir); report.state = 'backed-up'; write();
    store = new CompanionMemoryStore({ userDataPath: root });
    const before = store.status(); report.before = { candidates: before.pendingCandidates, accepted: before.longTermMemories, turns: before.turns, delivery: store.journalDeliveryStatus() };
    if (!args.includes('--local-only')) {
    const settings = createKnowledgeOsSettings({ safeStorage, userDataPath: root });
    const client = new KnowledgeOsMcpClient({ settings });
    const health = await client.testConnection(); report.health = { ok: health.ok, reason: health.reason || '' }; write();
    if (health.ok) {
      const service = new MemoryJournalService({ store, policyStore: new CompanionMemoryPolicyStore({ userDataPath: root }), knowledgeBaseProjection: () => ({}), knowledgeOsSettings: settings, knowledgeOsClient: client, loadSecret: () => { throw Error('maintenance-summary-forbidden'); } });
      const seen = new Set();
      for (let i = 0; i < 16; i++) {
        const result = await service.syncPending({ force: true });
        report.passes.push(result); report.state = 'synchronizing'; write();
        for (const item of result.receipts || []) seen.add(`${item.day}:${item.memoryClass}`);
        const remainingReceipts = store.db.prepare("SELECT id,day,memory_class AS memoryClass FROM memory_journal_outbox WHERE status='accepted'").all().some(item => !store.syncMeta(`sealed:${item.id}`) && !seen.has(`${item.day}:${item.memoryClass}`));
        if (result.nextRetryAt || result.skipped || (!store.pendingJournalDeliveries({ limit: 1, force: true }).length && !remainingReceipts)) break;
      }
    }
    }
    if (args.includes('--organize-local')) {
      report.organization = new MemoryCandidateReviewService({ store, loadSecret: () => { throw Error('memory-model-not-authorized'); } }).organizeLocal();
    }
    if (args.includes('--organize') && !args.includes('--local-only')) {
      report.state = 'organizing'; write();
      const secure = createSecureAiServiceStore({ safeStorage, userDataPath: root });
      const bailian = createSecureBailianStore({ safeStorage, userDataPath: root });
      const service = new MemoryCandidateReviewService({ store, loadSecret: () => secure.status().text.configured ? secure.loadTextSecret() : { ...bailian.loadSecret(), provider: 'bailian' } });
      report.organization = await service.organize();
    }
    const after = store.status(); report.after = { candidates: after.pendingCandidates, accepted: after.longTermMemories, turns: after.turns, classification: after.candidateReview, delivery: store.journalDeliveryStatus(), pendingSync: store.workdayStatus().pendingJournalSync };
    report.state = 'finished';
  } catch (error) { report.state = 'failed'; report.reason = /^(memory|knowledgeos|text-model)-[a-z-]+$/.test(error?.message || '') ? error.message : 'maintenance-failed'; }
  finally { store?.close(); write(); app.quit(); }
});
