import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defaultState, validateConfig } from '../src/store/appStore.js';
const require = createRequire(import.meta.url);
const backup = require('../electron/local-backup.cjs');
const { LocalHistoryStore } = require('../electron/local-history-store.cjs');
const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
const { PersonalReminderStore } = require('../electron/personal-reminders.cjs');
const { LocalBackupService } = require('../electron/local-backup-service.cjs');
const {spawnSync} = require('node:child_process');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t32b-'));
  t.after(() => { assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'deskmate-t32b-')); fs.rmSync(root, {recursive:true,force:true}); });
  const history = new LocalHistoryStore({userDataPath:root});
  history.finish({manifest:[],audioManifest:[]});
  history.putAudio({id:'audio-1',bytes:new Uint8Array([1,2,3]),createdAt:Date.parse('2026-01-01T00:00:00Z')});
  history.append({id:'synthetic-1',text:'Synthetic text',rawText:'Synthetic raw',time:'08:00',audioId:'audio-1',createdAt:'2026-01-01T00:00:00Z'});
  history.close();
  new CompanionMemoryStore({userDataPath:root}).close();
  const config = structuredClone(defaultState);
  return {root, config, bundle:(audio=false)=>backup.buildBundle(root,config,audio)};
}
test('backup excludes credentials, paths, runtime and opt-in audio bytes', t => {
  const f=fixture(t);
  f.config.settings.apiKey='SYNTHETIC_SECRET'; f.config.settings.microphoneId='SYNTHETIC_PATH';
  fs.writeFileSync(path.join(f.root,'knowledgeos-settings.json'),'SYNTHETIC_SECRET_FILE');
  const b=f.bundle(); const content=JSON.stringify(b);
  assert(!content.includes('SYNTHETIC_SECRET'));assert(!content.includes('SYNTHETIC_PATH'));
  assert.equal(b.data.audio.length,0);assert.equal(b.data.history.history.length,1);
  assert.equal(b.data.config.runtime,undefined);assert.equal(b.version,1);
  const preview=backup.prepareRestore(f.root,b);
  const stage=path.join(f.root,'recovery',`staged-${preview.id}`);
  const restored=new LocalHistoryStore({userDataPath:stage});
  try {assert.equal(restored.list()[0].audioId,undefined);assert.equal(restored.list()[0].recordingUnavailable,true);assert.equal(restored.status().recordings,0);}finally{restored.close();}
  const ui=JSON.parse(fs.readFileSync(path.join(stage,'restored-ui-state.json')));
  assert.equal(validateConfig(ui.config).settings.companionWakeEnabled,false);
});
test('audio is verified and restored into a trusted managed directory', t => {
  const f=fixture(t), b=f.bundle(true), preview=backup.prepareRestore(f.root,b);
  assert.equal(preview.summary.recordings,1);
  const store=new LocalHistoryStore({userDataPath:path.join(f.root,'recovery',`staged-${preview.id}`)});
  try{assert.deepEqual([...store.readAudio('audio-1').bytes],[1,2,3]);assert.equal(store.list()[0].createdAt,'2026-01-01T00:00:00.000Z');}finally{store.close();}
});
test('personal reminders survive backup preview and restore', t => {
  const f=fixture(t), reminder=new PersonalReminderStore({userDataPath:f.root});
  reminder.create({title:'Synthetic reminder',remindAt:Date.now()+3600000,eventAt:Date.now()+7200000,important:true});
  const b=f.bundle(); assert.equal(b.data.reminders.items.length,1);
  const preview=backup.prepareRestore(f.root,b); assert.equal(preview.summary.reminders,1);
  const restored=JSON.parse(fs.readFileSync(path.join(f.root,'recovery',`staged-${preview.id}`,'personal-reminders.json')));
  assert.equal(restored.items[0].title,'Synthetic reminder'); assert.equal(restored.items[0].important,true);
});
test('checksum, schema and audio corruption fail before modifying live data', t => {
  const f=fixture(t), original=fs.readFileSync(path.join(f.root,'voice-history.sqlite3'));
  for(const mutate of [b=>b.version=99,b=>b.data.config.settings.formatting='broken',b=>b.data.audio[0].base64='AAAA']) {
    const b=f.bundle(true);mutate(b);assert.throws(()=>backup.prepareRestore(f.root,b));
  }
  const b=f.bundle();b.data.memory.arbitrary_sql=[];b.digest=backup.sha(JSON.stringify(b.data));
  assert.throws(()=>backup.prepareRestore(f.root,b),/tables-invalid/);
  assert(fs.readFileSync(path.join(f.root,'voice-history.sqlite3')).equals(original));
});
test('offline apply failure rolls back all targets and leaves credentials untouched', t => {
  const f=fixture(t), preview=backup.prepareRestore(f.root,f.bundle(true));
  const previous=fs.readFileSync(path.join(f.root,'voice-history.sqlite3'));
  fs.writeFileSync(path.join(f.root,'knowledgeos-settings.json'),'unchanged');
  backup.queueRestore(f.root,preview.id);
  const result=backup.applyQueuedRestore(f.root,{afterWrite:()=>{throw new Error('simulated interruption');}});
  assert.equal(result.rolledBack,true);
  assert(fs.readFileSync(path.join(f.root,'voice-history.sqlite3')).equals(previous));
  assert.equal(fs.readFileSync(path.join(f.root,'knowledgeos-settings.json'),'utf8'),'unchanged');
});
test('offline restore commits exact staged data and retains a previous snapshot', t => {
  const f=fixture(t);f.config.keymap[3]={action:'open-app',appActionId:'11111111-1111-1111-1111-111111111111',appName:'Synthetic'};
  const preview=backup.prepareRestore(f.root,f.bundle());backup.queueRestore(f.root,preview.id);
  const result=backup.applyQueuedRestore(f.root);assert.equal(result.applied,true);
  const ui=JSON.parse(fs.readFileSync(path.join(f.root,'restored-ui-state.json')));
  assert.equal(ui.config.keymap[3].action,'disabled');assert(ui.pending);
  assert(fs.existsSync(path.join(f.root,'recovery',`previous-${preview.id}`,'manifest.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'companion-memory-policy.json'))).schedule,'manual');
  assert.equal(backup.applyQueuedRestore(f.root).applied,false);
});
test('worker exports and inspects without accepting restore commands or returning paths', async t => {
  const f=fixture(t), service=new LocalBackupService({userDataPath:f.root});t.after(()=>service.close());
  const destination=fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-t32b-export-'));
  t.after(()=>{assert(path.dirname(destination)===os.tmpdir());fs.rmSync(destination,{recursive:true,force:true});});
  const file=path.join(destination,'test.deskmate-backup.json');
  const writing=service.call('export',{file,config:f.config,includeAudio:true});
  await assert.rejects(service.call('inspect',{file}),/backup-busy/);
  assert.equal((await writing).recordings,1);
  const result=await service.call('inspect',{file});assert.equal(result.restoreAvailable,false);assert.equal(result.summary.history,1);
  assert(!JSON.stringify(result).includes(f.root));assert(!JSON.stringify(result).includes(file));
  await assert.rejects(service.call('restore',{}),/command-invalid/);
  await assert.rejects(service.call('export',{file:path.join(f.root,'wrong.deskmate-backup.json'),config:f.config,includeAudio:false}),/target-is-internal/);
  fs.writeFileSync(file,'broken');await assert.rejects(service.call('inspect',{file}),/data-or-storage-invalid/);
});
test('untrusted rows with a recomputed outer checksum are still rejected', t => {
  const f=fixture(t);
  for(const mutate of [
    b=>b.data.history.history[0].payload='{}',
    b=>b.data.history.history[0].created_at=-1,
    b=>b.data.history.history[0].unexpected='SELECT something',
    b=>b.data.config.keymap[0].action='execute-arbitrary-code',
    b=>b.data.config.settings.formatting='wrong',
    b=>b.data.history.audio[0].digest='../outside'
  ]) {
    const b=f.bundle();mutate(b);b.digest=backup.sha(JSON.stringify(b.data));
    assert.throws(()=>backup.prepareRestore(f.root,b));
  }
});
test('a real process interruption is rolled back on the next offline entry', t => {
  const f=fixture(t), original=fs.readFileSync(path.join(f.root,'voice-history.sqlite3'));
  const preview=backup.prepareRestore(f.root,f.bundle());backup.queueRestore(f.root,preview.id);
  const modulePath=require.resolve('../electron/local-backup.cjs');
  const child=spawnSync(process.execPath,['-e',`require(${JSON.stringify(modulePath)}).applyQueuedRestore(${JSON.stringify(f.root)},{afterWrite(){process.exit(91)}})`],{windowsHide:true});
  assert.equal(child.status,91);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'recovery','job.json'))).phase,'applying');
  assert.equal(backup.applyQueuedRestore(f.root).rolledBack,true);
  assert(fs.readFileSync(path.join(f.root,'voice-history.sqlite3')).equals(original));
});
test('snapshot disk-full before apply preserves every live target', t => {
  const f=fixture(t), original=fs.readFileSync(path.join(f.root,'voice-history.sqlite3'));
  const preview=backup.prepareRestore(f.root,f.bundle());backup.queueRestore(f.root,preview.id);
  const open=fs.openSync;
  fs.openSync=(file,...args)=>{if(String(file).includes(`previous-${preview.id}`) && String(file).endsWith('.tmp'))throw Object.assign(new Error('disk full'),{code:'ENOSPC'});return open(file,...args);};
  try{assert.throws(()=>backup.applyQueuedRestore(f.root),/disk full/);}finally{fs.openSync=open;}
  assert(fs.readFileSync(path.join(f.root,'voice-history.sqlite3')).equals(original));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'recovery','job.json'))).phase,'queued');
});
test('tampered manifest cannot write outside the explicit restore targets', t => {
  const f=fixture(t), preview=backup.prepareRestore(f.root,f.bundle());
  const manifest=path.join(f.root,'recovery',`staged-${preview.id}`,'manifest.json');
  const data=JSON.parse(fs.readFileSync(manifest));data.manifest[0].name='../outside';fs.writeFileSync(manifest,JSON.stringify(data));
  assert.throws(()=>backup.queueRestore(f.root,preview.id),/manifest-invalid/);
  assert.equal(fs.existsSync(path.join(f.root,'recovery/job.json')),false);
});
test('multi-megabyte recording uses bounded binary validation rather than recursive regex', t => {
  const f=fixture(t),history=new LocalHistoryStore({userDataPath:f.root});
  history.putAudio({id:'large-audio',bytes:new Uint8Array(2*1024*1024).fill(123)});history.close();
  const preview=backup.prepareRestore(f.root,f.bundle(true));assert.equal(preview.summary.recordings,2);
});
test('corrupt source payload and config are not normalized into a successful backup', t => {
  const f=fixture(t),history=new LocalHistoryStore({userDataPath:f.root});
  history.db.prepare('UPDATE history SET payload=?').run('{"changed":true}');history.close();
  assert.throws(()=>f.bundle(),/history-integrity/);
  const original=fs.readFileSync(path.join(f.root,'voice-history.sqlite3'));assert(original.length>0);
  fs.writeFileSync(path.join(f.root,'companion-persona.json'),'{broken');
  assert.throws(()=>f.bundle());assert.equal(fs.readFileSync(path.join(f.root,'companion-persona.json'),'utf8'),'{broken');
});
test('memory text, evidence IDs, dates and review state survive the logical round trip', t => {
  const f=fixture(t),memory=new CompanionMemoryStore({userDataPath:f.root});
  const turn=memory.commitConversationTurn({eventId:'dictation:synthetic-1',sessionId:'synthetic',role:'user',content:'Synthetic work evidence',source:'dictation',createdAt:'2026-01-01T00:00:00Z'});
  const candidate=memory.addCandidate({day:'2026-01-01',summary:'Synthetic reviewed memory',sourceTurnIds:[turn.turnId],source:'dictation'});
  memory.db.prepare("UPDATE memory_candidates SET state='accepted' WHERE id=?").run(candidate.id);
  memory.upsertDailySummary({day:'2026-01-01',summary:'Synthetic day summary',source:'dictation',sourceTurnCount:1});memory.close();
  const preview=backup.prepareRestore(f.root,f.bundle());
  const restored=new CompanionMemoryStore({userDataPath:path.join(f.root,'recovery',`staged-${preview.id}`)});
  try {
    const row=restored.db.prepare('SELECT * FROM conversation_turns').get();
    assert.equal(row.source_event_id,'dictation:synthetic-1');assert.equal(row.created_at,Date.parse('2026-01-01T00:00:00Z'));
    const item=restored.db.prepare('SELECT * FROM memory_candidates').get();assert.equal(item.state,'accepted');assert.deepEqual(JSON.parse(item.source_turn_ids),[turn.turnId]);
    assert.equal(restored.db.prepare('SELECT summary FROM daily_summaries').get().summary,'Synthetic day summary');
  }finally{restored.close();}
});
test('T71 old backups remain restorable, new provenance survives and cloud consent clears', t => {
  const f = fixture(t), store = new CompanionMemoryStore({userDataPath:f.root});
  store.setCurationEnabled({enabled:true,confirmed:true});
  const turn = store.appendTurn({sessionId:'curation',role:'user',content:'我希望答案简洁，这样更好理解。'});
  const candidate = store.addCandidate({day:'2026-09-24',summary:'回答简洁',sourceTurnIds:[turn.id]});
  store.commitCuration(store.curationSnapshot(store.curationCandidates()),[{ids:[candidate.id],action:'remember',kind:'preference',summary:'用户偏好简洁回答',reason:'原话支持',evidence:[{turnId:turn.id,quote:'我希望答案简洁，这样更好理解。'}],conflictIds:[]}]);
  store.close();
  const bundle = f.bundle(); const preview = backup.prepareRestore(f.root,bundle);
  const restored = new CompanionMemoryStore({userDataPath:path.join(f.root,'recovery',`staged-${preview.id}`)});
  try { assert.equal(restored.curationStatus().enabled,false); assert.equal(restored.curationStatus().automatic,1); assert.equal(restored.list({filter:'long-term'})[0].provenance.length,1); } finally { restored.close(); }
  delete bundle.data.memory.memory_curation_items; bundle.digest=backup.sha(JSON.stringify(bundle.data));
  assert.doesNotThrow(()=>backup.prepareRestore(f.root,bundle));
});
