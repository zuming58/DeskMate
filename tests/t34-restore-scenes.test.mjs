import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { defaultState } from '../src/store/appStore.js';
import { restoreBeforeMount } from '../src/store/restoreHandover.js';
import { purgeCompletedRestoreCopies } from '../src/store/historyPersistence.js';
const require=createRequire(import.meta.url);
const {LocalHistoryStore}=require('../electron/local-history-store.cjs');
const {CompanionMemoryStore}=require('../electron/companion-memory.cjs');
const {LocalBackupService}=require('../electron/local-backup-service.cjs');
const {buildBundle}=require('../electron/local-backup.cjs');
const {startupRestore,getHandover,acknowledgeHandover}=require('../electron/restore-lifecycle.cjs');
const {PromptWorkbenchStore}=require('../electron/prompt-workbench.cjs');
const {PromptWorkbenchController}=require('../electron/prompt-workbench-controller.cjs');
const {LocalRetention,DAY}=require('../electron/local-retention.cjs');
const {MemoryJournalService}=require('../electron/memory-journal-service.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-t34-'));t.after(()=>{assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});const h=new LocalHistoryStore({userDataPath:root});h.finish({manifest:[],audioManifest:[]});h.close();new CompanionMemoryStore({userDataPath:root}).close();return root;}
test('T34 worker prepare, queue, offline startup and renderer handover complete without replay',async t=>{
  const root=fixture(t),memory=new CompanionMemoryStore({userDataPath:root});
  memory.db.prepare('INSERT INTO companion_memory_meta VALUES (?,1)').run('restore-hold:2026-01-01');memory.close();
  const bundle=buildBundle(root,defaultState),file=path.join(root,'synthetic.json');fs.writeFileSync(file,JSON.stringify(bundle));
  fs.writeFileSync(path.join(root,'knowledgeos-settings.json'),JSON.stringify({credentialId:'keep-local',command:'keep-encrypted',readEnabled:true,syncEnabled:true}));
  const service=new LocalBackupService({userDataPath:root});t.after(()=>service.close());
  const preview=await service.call('prepare',{file});assert(preview.token);assert(!fs.existsSync(path.join(root,'recovery/job.json')));
  await service.call('queue',{token:preview.token});assert.equal(startupRestore(root).applied,true);
  const kos=JSON.parse(fs.readFileSync(path.join(root,'knowledgeos-settings.json')));assert.equal(kos.credentialId,'keep-local');assert.equal(kos.syncEnabled,false);assert.equal(kos.readEnabled,false);
  const values=new Map([['deskmate.app-state','old-config'],['deskmate.history-pending.v1','old-pending']]);
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let fail=true;const bridge={getRestoreHandover:()=>getHandover(root),acknowledgeRestore:id=>{if(fail)throw Error('lost ACK');return acknowledgeHandover(root,id);}};
  await assert.rejects(restoreBeforeMount(bridge,storage),/lost ACK/);fail=false;await restoreBeforeMount(bridge,storage);
  assert.equal(getHandover(root),null);assert.equal(JSON.parse(values.get('deskmate.app-state')).keyboardLayoutVersion,1);
  assert.equal(JSON.parse(values.get(`deskmate.restore.${preview.token}.previous`)).state,'old-config');assert(!values.has('deskmate.history-pending.v1'));
});
test('T34 held imported journal is excluded while a new day remains deliverable',t=>{
  const root=fixture(t),store=new CompanionMemoryStore({userDataPath:root});
  try {
  for(const day of ['2026-01-01','2026-01-02'])store.queueJournalDelivery({day,memoryClass:'work',projectId:null,idempotencyKey:day,payload:{markdown:'synthetic'}});
  store.db.prepare('INSERT INTO companion_memory_meta VALUES (?,1)').run('restore-hold:2026-01-01');
  assert.deepEqual(store.pendingJournalDeliveries().map(row=>row.day),['2026-01-02']);assert(store.isRestoredDay('2026-01-01'));
  } finally { store.close(); }
});
test('T34 scene rename persists, archive retains content, last scene and conflicts are protected',t=>{
  const root=fixture(t);let store=new PromptWorkbenchStore({userDataPath:root});const first=store.snapshot();
  store.mutate({type:'manage-scene',id:'scene-video',title:'我的创作',hint:'图文视频',revision:first.revision});
  store=new PromptWorkbenchStore({userDataPath:root});assert.equal(store.snapshot().scenes.find(s=>s.id==='scene-video').title,'我的创作');
  assert.throws(()=>store.mutate({type:'manage-scene',id:'scene-video',title:'过期修改',revision:first.revision}),/内容已更新/);
  const before=store.snapshot().scenes.find(s=>s.id==='scene-video');
  store.mutate({type:'manage-scene',id:'scene-video',archived:true,revision:store.snapshot().revision});
  assert.deepEqual(store.snapshot().scenes.find(s=>s.id==='scene-video').bindings,before.bindings);
  assert.throws(()=>store.mutate({type:'scene',id:'scene-video'}),/归档/);
  store.mutate({type:'manage-scene',id:'office',archived:true,revision:store.snapshot().revision});
  assert.throws(()=>store.mutate({type:'manage-scene',id:'coding',archived:true,revision:store.snapshot().revision}),/至少保留/);
  store.mutate({type:'manage-scene',id:'scene-video',archived:false,direction:-1,revision:store.snapshot().revision});
  assert.equal(store.snapshot().scenes[0].id,'scene-video');
});
test('T34 Tab cycle excludes archived scenes and follows reordered active scenes',async()=>{
  const store=new PromptWorkbenchStore();
  store.mutate({type:'manage-scene',id:'scene-video',archived:true,revision:0});
  const controller=new PromptWorkbenchController({store,isForeground:()=>true,announce:()=>{}});
  assert.equal((await controller.command({type:'cycle'})).activeScene,'office');
  assert.equal((await controller.command({type:'cycle'})).activeScene,'coding');
  store.mutate({type:'manage-scene',id:'scene-video',archived:false,direction:-1,revision:store.snapshot().revision});
  assert.equal((await controller.command({type:'cycle',reverse:true})).activeScene,'scene-video');
});
test('T34 verified local snapshot prepares recovery and rejects corrupt replacement',async t=>{
  const root=fixture(t),service=new LocalBackupService({userDataPath:root});
  try {await service.call('checkpoint',{config:defaultState});const file=path.join(root,'recovery/verified-latest.json'),prior=fs.readFileSync(file);
    await assert.rejects(service.call('checkpoint',{config:{}}));assert.deepEqual(fs.readFileSync(file),prior);
    const result=await service.call('prepare-checkpoint',{});assert(result.token);assert.equal(result.summary.recordings,0);
  }finally{service.close();}
});

test('T34 recovery expiry requires consent and preserves unfinished jobs and external backups',t=>{
  const root=fixture(t),now=Date.now(),retention=new LocalRetention({userDataPath:root,now:()=>now});
  const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
  for(const id of ids){const dir=path.join(root,'recovery',`previous-${id}`);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'synthetic'),'old');fs.utimesSync(dir,new Date(now-8*DAY),new Date(now-8*DAY));}
  const snapshot=path.join(root,'recovery/verified-latest.json'),exported=path.join(root,'user-export.deskmate-backup.json');fs.writeFileSync(snapshot,'old');fs.writeFileSync(exported,'keep');fs.utimesSync(snapshot,new Date(now-21*DAY),new Date(now-21*DAY));
  fs.writeFileSync(path.join(root,'recovery/job.json'),JSON.stringify({id:ids[1],phase:'applying'}));
  retention.purgeExpired();assert(fs.existsSync(snapshot));
  retention.saveState({enabled:true});retention.purgeExpired();
  assert(!fs.existsSync(path.join(root,'recovery',`previous-${ids[0]}`)));assert(fs.existsSync(path.join(root,'recovery',`previous-${ids[1]}`)));assert(!fs.existsSync(snapshot));assert(fs.existsSync(exported));
  const marker=`deskmate.restore.${ids[0]}`,pending=`deskmate.restore.${ids[1]}`;
  const map=new Map([[`${marker}.previous`,'old'],[`${marker}.completed-at`,String(now-8*DAY)],[`${pending}.previous`,'keep']]);
  const storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:key=>map.get(key),removeItem:key=>map.delete(key)};
  purgeCompletedRestoreCopies(storage,now);assert(!map.has(`${marker}.previous`));assert(map.has(`${pending}.previous`));
});

test('T34 restored current day cannot automatically summarize or close after schedules are re-enabled',async()=>{
  let writes=0;
  const service=new MemoryJournalService({store:{ensureActiveWorkday:()=>({day:'2026-09-13'}),isRestoredDay:()=>true,beginWorkdayClose:()=>{writes++;}},policyStore:{snapshot:()=>({hourlyEnabled:true,enabledSources:['companion']})},knowledgeBaseProjection:{},knowledgeOsSettings:{status:()=>({})},knowledgeOsClient:{callTool:async()=>{writes++;}},loadSecret:()=>{throw Error('unexpected model access');}});
  assert.equal((await service.processHourly()).reason,'memory-restored-day-held');assert.equal((await service.closeCurrentWorkday()).reason,'memory-restored-day-held');assert.equal(writes,0);
});

test('T34 portable motion settings and pending encoder survive backup without activating motion',t=>{
  const root=fixture(t),{ChoreographyStore}=require('../electron/choreography-store.cjs');const store=new ChoreographyStore({userDataPath:root});
  const value={version:4,actions:[],defaultDanceName:'',motionSettings:{...store.getMotionSettings(),yawAmplitudeDegrees:12}};
  fs.writeFileSync(path.join(root,'choreographies.json'),JSON.stringify(value));
  const config=structuredClone(defaultState);config.keyboardPending={encoder:{reverseVertical:!config.encoder.reverseVertical}};
  const bundle=buildBundle(root,config);assert.equal(bundle.data.policies.choreography.motionSettings.yawAmplitudeDegrees,12);assert.equal(bundle.data.config.encoder.reverseVertical,!defaultState.encoder.reverseVertical);
  fs.writeFileSync(path.join(root,'choreographies.json'),'broken');assert.throws(()=>buildBundle(root,config));
});

test('T34 startup recovery may replace an interrupted job only explicitly and preserves its journal',t=>{
  const root=fixture(t),engine=require('../electron/local-backup.cjs'),bundle=buildBundle(root,defaultState);
  const first=engine.prepareRestore(root,bundle);engine.queueRestore(root,first.id);const second=engine.prepareRestore(root,bundle);
  assert.throws(()=>engine.queueRestore(root,second.id),/already-queued/);
  engine.queueRestore(root,second.id,{supersedeInterrupted:true});assert.equal(JSON.parse(fs.readFileSync(path.join(root,'recovery',`interrupted-job-${second.id}.json`))).id,first.id);
  assert.equal(engine.applyQueuedRestore(root).applied,true);
});
