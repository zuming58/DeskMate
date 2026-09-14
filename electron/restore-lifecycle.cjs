const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readJson, writeAtomic, json, applyQueuedRestore } = require('./local-backup.cjs');

function startupRestore(root) {
  const result = applyQueuedRestore(root);
  const handover = readJson(path.join(root, 'restored-ui-state.json'), null);
  if (handover?.pending) {
    // Reapply on interrupted handover; no normal services have started yet.
    const connection = path.join(root, 'knowledgeos-settings.json');
    if (fs.existsSync(connection)) writeAtomic(connection, json({ ...readJson(connection), readEnabled: false, syncEnabled: false }));
    writeAtomic(path.join(root, 'retention-state.json'), json({ version: 1, enabled: false, lastRunAt: null, lastResult: null }));
  }
  return result;
}
function getHandover(root) {
  const value = readJson(path.join(root, 'restored-ui-state.json'), null);
  return value?.pending ? { id: value.id, config: value.config } : null;
}
function acknowledgeHandover(root, id) {
  const file = path.join(root, 'restored-ui-state.json');
  const value = readJson(file, null);
  if (!value || value.id !== id) throw new Error('backup-handover-invalid');
  writeAtomic(file, json({ ...value, pending: false }));
  return { ok: true };
}
function verifyStartupDatabases(root) {
  for(const name of ['voice-history.sqlite3','companion-memory.sqlite3']) {
    const file=path.join(root,name);if(!fs.existsSync(file))continue;
    const db=new DatabaseSync(file,{readOnly:true});
    try {db.exec('PRAGMA trusted_schema=OFF');if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('backup-database-corrupt');}
    finally {db.close();}
  }
}
module.exports = { startupRestore, getHandover, acknowledgeHandover, verifyStartupDatabases };
