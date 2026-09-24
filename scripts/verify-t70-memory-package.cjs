// Packaged code only, synthetic data, no production main or external calls.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const asar = require('@electron/asar');
const { load } = require('./verify-t53-natural-package.cjs');
const { CompanionMemoryStore } = load('electron/companion-memory.cjs');
const { MemoryCandidateReviewService } = load('electron/memory-candidate-review.cjs');
const { MemoryJournalService } = load('electron/memory-journal-service.cjs');
async function verify() {
  const release = process.argv[2] || 'release-t70-final';
  assert(/^release(?:-[a-z0-9-]+)?$/.test(release));
  const archive = path.resolve(__dirname, '..', release, 'win-unpacked/resources/app.asar');
  const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
  assert(!files.some(file => file.includes('/node_modules/@tabler/')), 'unbundled icon sources are build-only');
  assert(!files.some(file => /^\/node_modules\/(?:react|react-dom|vite)\//.test(file)), 'renderer is already bundled');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t70-package-'));
  const store = new CompanionMemoryStore({ userDataPath: root });
  try {
    store.addCandidate({ day: '2099-01-01', kind: 'project', summary: '合成项目资料' });
    store.addCandidate({ day: '2099-01-01', kind: 'preference', summary: '合成个人偏好' });
    const local = new MemoryCandidateReviewService({ store, loadSecret: () => { throw Error('no cloud'); } }).organizeLocal();
    assert.equal(local.reference, 1); assert.equal(local.review, 1); assert.equal(store.status().longTermMemories, 0);
    const row = store.queueJournalDelivery({ day: '2099-01-01', memoryClass: 'work', idempotencyKey: 'synthetic:old', payload: {} });
    store.markJournalDelivery(row.id, { ok: true, submissionId: 'synthetic-missing' });
    store.queueJournalDelivery({ day: '2099-01-02', memoryClass: 'work', idempotencyKey: 'synthetic:new', payload: { idempotency_key: 'synthetic:new' } });
    const calls = [];
    const service = new MemoryJournalService({ store, policyStore: { snapshot: () => ({}) }, knowledgeBaseProjection: () => ({}), knowledgeOsSettings: { status: () => ({ configured: true, syncEnabled: true }) }, loadSecret: () => { throw Error('no model'); }, knowledgeOsClient: { callTool: async (name, args) => {
      calls.push({ name, args }); return name === 'submission.get_status' ? { ok: false, reason: 'knowledgeos-resource-not-found' } : { ok: true, data: { submission_id: 'synthetic-new' } };
    } } });
    assert.equal((await service.syncPending()).accepted, 1);
    assert.equal(calls.at(-1).args.idempotency_key, 'synthetic:new');
    assert.equal(store.journalDeliveryStatus().sealed, 0);
    console.log('T70 final-ASAR local classification, no automatic approval, missing-receipt isolation and idempotent payload passed. Synthetic only.');
  } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
