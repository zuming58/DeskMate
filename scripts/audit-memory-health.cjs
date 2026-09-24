// Read-only, explicit profile audit. Never generates summaries or submits content.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const args = process.argv.slice(2);
const argument = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const root = argument('--user-data');
const reportFile = argument('--report');
const since = argument('--since');
if (!path.isAbsolute(root || '') || !path.isAbsolute(reportFile || '') || !/^\d{4}-\d{2}-\d{2}$/.test(since || '')) throw new Error('audit-arguments-invalid');
app.setPath('userData', root);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const report = { at: new Date().toISOString(), since, readOnly: true };
  let db;
  try {
    db = new DatabaseSync(path.join(root, 'companion-memory.sqlite3'), { readOnly: true });
    report.journals = db.prepare('SELECT day,status,source_turn_count AS turns,completed_at AS completedAt FROM memory_daily_journals WHERE day>=?').all(since);
    report.deliveries = db.prepare('SELECT day,memory_class AS memoryClass,status,attempts,last_error AS reason,submission_id AS submissionId FROM memory_journal_outbox WHERE day>=?').all(since);
    const settings = createKnowledgeOsSettings({ safeStorage, userDataPath: root });
    const status = settings.status();
    report.connection = { configured: status.configured, adapter: status.commandLabel, syncEnabled: status.syncEnabled };
    const client = new KnowledgeOsMcpClient({ settings });
    const health = await client.testConnection();
    report.health = { ok: health.ok, reason: health.reason || '' };
    report.receipts = [];
    if (health.ok) for (const row of report.deliveries.filter(row => row.submissionId)) {
      const result = await client.callTool('submission.get_status', { submission_id: row.submissionId });
      report.receipts.push({ day: row.day, memoryClass: row.memoryClass, ok: result.ok, reason: result.reason || '', status: result.data?.status || '', stage: result.data?.stage || '', progress: result.data?.progress || 0 });
    }
  } catch { report.error = 'audit-read-failed'; }
  finally { db?.close(); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); app.quit(); }
});
