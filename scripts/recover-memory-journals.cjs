// Explicit maintenance entry; quit DeskMate before running. Uses its encrypted
// profile and the existing journal/outbox services, never writes raw DB results.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { CompanionMemoryStore, localDayAt } = require('../electron/companion-memory.cjs');
const { CompanionMemoryPolicyStore } = require('../electron/companion-memory-policy.cjs');
const { createSecureAiServiceStore } = require('../electron/secure-ai-services.cjs');
const { createSecureBailianStore } = require('../electron/secure-bailian.cjs');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const { createKnowledgeBaseSettings } = require('../electron/knowledge-base-settings.cjs');
const { KnowledgeBaseProjection } = require('../electron/knowledge-base-projection.cjs');
const { MemoryJournalService } = require('../electron/memory-journal-service.cjs');
const { requestTextModelJson } = require('../electron/text-model-json.cjs');
const args = process.argv.slice(2);
const argument = name => args[args.indexOf(name) + 1];
if (!args.includes('--user-data') || !args.includes('--report') || !args.includes('--day')) throw new Error('maintenance-arguments-required');
const userDataPath = path.resolve(argument('--user-data'));
const reportFile = path.resolve(argument('--report'));
const day = argument('--day');
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('maintenance-day-invalid');
app.setPath('userData', userDataPath);
app.disableHardwareAcceleration();
const report = { day, state: 'starting', calls: [], receipts: [] };
const write = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
app.whenReady().then(async () => {
  let store;
  try {
    const secure = createSecureAiServiceStore({ safeStorage, userDataPath });
    const bailian = createSecureBailianStore({ safeStorage, userDataPath });
    const loadSecret = () => secure.status().text.configured ? secure.loadTextSecret() : { ...bailian.loadSecret(), provider: 'bailian' };
    const connection = createKnowledgeOsSettings({ safeStorage, userDataPath });
    report.adapterLabel = connection.status().commandLabel;
    if (args.includes('--adapter')) {
      const candidate = path.resolve(argument('--adapter'));
      const testClient = new KnowledgeOsMcpClient({ settings: { status: () => connection.status(), loadConnection: () => ({ command: candidate, credentialId: connection.status().credentialId }) } });
      const health = await testClient.callTool('health.get_summary');
      if (!health.ok) throw new Error(health.reason);
      connection.saveCommand(candidate);
      report.adapterUpdated = true;
    }
    const knowledgeOsClient = new KnowledgeOsMcpClient({ settings: connection });
    const secret = loadSecret();
    report.configuration = { model: secret.model, provider: secret.provider, keyDecrypted: Boolean(secret.apiKey), knowledgeOsConfigured: connection.status().configured };
    if (!report.configuration.knowledgeOsConfigured) throw new Error('knowledgeos-not-configured');
    store = new CompanionMemoryStore({ userDataPath });
    if (day >= localDayAt() && store.dailyJournal(day)?.status !== 'closing') throw new Error('maintenance-day-not-closed');
    const projectionSettings = createKnowledgeBaseSettings({ safeStorage, userDataPath });
    const service = new MemoryJournalService({ store, policyStore: new CompanionMemoryPolicyStore({ userDataPath }), knowledgeOsSettings: connection, knowledgeOsClient, loadSecret,
      knowledgeBaseProjection: () => new KnowledgeBaseProjection({ root: projectionSettings.loadRoot() }).sync(store.projectionItems()),
      requestJson: async options => {
        const input = JSON.parse(options.messages.at(-1).content);
        const entry = { stage: input.records ? 'review' : 'synthesis', records: input.records?.length || 0, startedAt: new Date().toISOString() };
        report.calls.push(entry); report.state = entry.stage; write();
        try { const result = await requestTextModelJson({ ...options, fetchImpl: async (...request) => {
          const response = await fetch(...request);
          const data = await response.json();
          entry.finishReason = data?.choices?.[0]?.finish_reason;
          entry.outputTokens = data?.usage?.completion_tokens;
          return { ok: response.ok, json: async () => data };
        } }); entry.ok = true; return result; }
        finally { entry.finishedAt = new Date().toISOString(); write(); }
      },
    });
    const result = await service.finalizeDay(day, { manual: true });
    report.result = { ok: result.ok, reason: result.reason || '', turns: result.turns || 0 };
    const sync = await service.syncPending({ force: true, day });
    report.sync = sync;
    const rows = store.db.prepare("SELECT day, memory_class AS memoryClass, status, submission_id AS submissionId FROM memory_journal_outbox WHERE day=?").all(day);
    for (const row of rows) {
      const receipt = row.submissionId ? await knowledgeOsClient.callTool('submission.get_status', { submission_id: row.submissionId }) : null;
      report.receipts.push({ memoryClass: row.memoryClass, localStatus: row.status, submissionId: row.submissionId, ok: receipt?.ok === true, status: receipt?.data?.status || '', stage: receipt?.data?.stage || '', progress: receipt?.data?.progress || 0 });
    }
    report.state = result.ok ? 'completed' : 'failed';
  } catch (error) { report.state = 'failed'; report.error = /^(?:memory|text-model|knowledgeos|maintenance)-[a-z0-9-]+$/.test(String(error.message)) ? error.message : 'maintenance-failed'; }
  finally { store?.close(); write(); app.quit(); }
});
