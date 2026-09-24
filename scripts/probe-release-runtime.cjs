// Isolated runtime compatibility check: no main-process bootstrap or devices.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const root = process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t66-runtime-'));
const reportPath = path.join(app.getPath('temp'), 'deskmate-runtime-probe-report.json');
app.setPath('userData', profile);
app.disableHardwareAcceleration();
const deadline = setTimeout(() => app.exit(2), 20_000);
app.whenReady().then(() => {
  let db;
  try {
    db = new DatabaseSync(path.join(profile, 'synthetic.sqlite3'));
    db.exec('CREATE TABLE probe(value TEXT); INSERT INTO probe VALUES (\'synthetic\')');
    assert.equal(db.prepare('SELECT value FROM probe').get().value, 'synthetic');
    assert(safeStorage.isEncryptionAvailable());
    assert.equal(safeStorage.decryptString(safeStorage.encryptString('synthetic')), 'synthetic');
    const native = require(require.resolve('sherpa-onnx-node', { paths: [root] }));
    assert.equal(typeof native.OfflineRecognizer, 'function');
    for (const file of ['companion-memory', 'memory-journal-service', 'local-retention', 'atomic-private-json', 'knowledgeos-mcp-client']) require(path.join(root, 'electron', file + '.cjs'));
    const report = { ok: true, isolated: true, root, electron: process.versions.electron, node: process.versions.node, sqlite: true, encryptedStorage: true, wakeNativeModule: true };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    db.close(); db = null; clearTimeout(deadline); app.exit(0);
  } catch (error) { fs.writeFileSync(reportPath, JSON.stringify({ ok: false, root, error: error.stack }, null, 2)); console.error(error.stack); db?.close(); clearTimeout(deadline); app.exit(1); }
});
