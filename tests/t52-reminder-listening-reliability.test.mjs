import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDiagnosticReport } from '../src/services/diagnostics.js';
const require = createRequire(import.meta.url);
const { PersonalReminderStore, PersonalReminderScheduler, PersonalReminderConversation, parsePersonalReminderIntent, validateReminderState } = require('../electron/personal-reminders.cjs');
const { ThreeStageCompanionProvider } = require('../electron/three-stage-companion-provider.cjs');
const { CompanionConversationController } = require('../electron/companion-conversation.cjs');
const { CompanionIntentBridge } = require('../electron/companion-intent-bridge.cjs');
const { SimulatedCompanionAudioSource, SimulatedCompanionAudioSink } = require('../electron/companion-audio.cjs');
const now = new Date(2026, 8, 15, 10).getTime();
function storeFor(t, clock = () => now) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t52-')); t.after(() => fs.rmSync(root, {recursive:true,force:true})); return new PersonalReminderStore({userDataPath:root,now:clock}); }
test('T52 Chinese hours/minutes parse without a model', () => { const p = parsePersonalReminderIntent('明天下午六点二十分提醒我开会', {now}); assert.equal(p.type,'create'); assert.equal(p.remindAt,new Date(2026,8,16,18,20).getTime()); });
test('T52 multi-turn period and purpose complete a bounded reminder draft', t => { const store=storeFor(t); const c=new PersonalReminderConversation({store,now:()=>now}); assert.equal(c.execute('明天六点提醒我开会').type,'clarify'); assert.equal(c.claims('下午'),true); assert.equal(c.execute('下午').ok,true); assert.equal(store.snapshot().items[0].title,'开会'); assert.equal(store.snapshot().items[0].remindAt,new Date(2026,8,16,18).getTime()); c.execute('明天下午七点提醒我'); assert.equal(c.claims('去取快递'),true); assert.equal(c.execute('去取快递').ok,true); assert.equal(store.snapshot().items[1].title,'去取快递'); });
test('T52 cancelled/expired drafts cannot create a later accidental reminder', t => { let clock=now; const c=new PersonalReminderConversation({store:storeFor(t,()=>clock),now:()=>clock}); c.execute('明天六点提醒我开会'); c.execute('算了'); assert.equal(c.claims('下午'),false); c.execute('明天六点提醒我开会'); clock+=120001; assert.equal(c.claims('下午'),false); });
test('T52 failure retries preserve due time and only audible completion marks notified', async t => { let clock=now; const store=storeFor(t,()=>clock); const item=store.create({title:'开会',remindAt:now}); let success=false; const scheduler=new PersonalReminderScheduler({store,now:()=>clock,schedule:()=>({unref(){}}),cancel:()=>{},onDue:async()=>({ok:success,voice:success})}); scheduler.start(); await scheduler.tick(); assert.equal(store.snapshot().items[0].status,'failed'); assert.equal(store.snapshot().items[0].remindAt,now); clock+=60000; success=true; await scheduler.tick(); assert.equal(store.snapshot().items[0].status,'notified'); scheduler.stop(); });
test('T52 late delivery completion cannot overwrite concurrent snooze', t => { const store=storeFor(t); const item=store.create({title:'开会',remindAt:now}); const [claimed]=store.claimDue(now); assert.equal(claimed.status,'delivering'); store.snooze(item.id,10); store.finishDelivery(item.id,claimed.deliveryAttempt,{ok:true,voice:true}); assert.equal(store.snapshot().items[0].status,'pending'); });
test('T52 fresh VAD accepts repeated text and reused item after playback boundary', () => { const p=new ThreeStageCompanionProvider({asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),schedule:()=>({unref(){}}),cancelSchedule:()=>{}}); p.handleAsrEvent({type:'speech.started',itemId:'old',audioStartMs:100}); p.asrAudioMs=4000; p.armPostPlaybackEchoTail('明天下午六点提醒你'); p.handleAsrEvent({type:'speech.started',itemId:'old',audioStartMs:4500}); assert.equal(p.isPostPlaybackEchoEvent({type:'final',itemId:'old',text:'明天下午六点'}),false); });
test('T52 standalone provider creates only TTS', async () => { let asr=0,model=0; const p=new ThreeStageCompanionProvider({announcementOnly:true,asrFactory:()=>{asr++;return {};},modelFactory:()=>{model++;return {};},ttsFactory:()=>({connect:async()=>({ok:true}),close(){}})}); await p.connect(); assert.equal(asr,0); assert.equal(model,0); p.close(); });

test('T52 Bridge owns a period-only follow-up without classifier calls', async t => {
  const store=storeFor(t), c=new PersonalReminderConversation({store,now:()=>now});
  const bridge=new CompanionIntentBridge({appActions:{listRegistered:()=>[]},reminderClaims:text=>c.claims(text),reminderAction:text=>c.execute(text),requestJson:async()=>{throw Error('classifier must not run');}});
  await bridge.analyze('明天六点提醒我开会');
  assert.equal(bridge.claimsTurn('下午'),true);
  assert.equal((await bridge.analyze('下午')).result.action,'create');
  assert.equal(store.snapshot().items.length,1);
});
test('T52 interrupted durable delivery recovers on restart and failures stop at three', t => {
  let clock=now; const store=storeFor(t,()=>clock), item=store.create({title:'开会',remindAt:now});
  store.claimDue(clock);
  const restarted=new PersonalReminderStore({userDataPath:path.dirname(store.filePath),now:()=>clock});
  assert.equal(restarted.snapshot().items[0].status,'pending');
  clock+=15000;
  for(let index=0;index<3;index++){const [claimed]=restarted.claimDue(clock);restarted.finishDelivery(item.id,claimed.deliveryAttempt,{ok:false});clock+=60000;}
  assert.equal(restarted.snapshot().items[0].status,'failed');
  assert.equal(restarted.nextPendingDue(),null);
});
test('T52 pre-boundary delayed echo is still rejected', () => {
  const p=new ThreeStageCompanionProvider({asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),schedule:()=>({unref(){}}),cancelSchedule:()=>{}});
  p.handleAsrEvent({type:'speech.started',itemId:'echo',audioStartMs:100});p.asrAudioMs=4000;p.armPostPlaybackEchoTail('这是上一段回答');
  p.handleAsrEvent({type:'speech.started',itemId:'echo',audioStartMs:3500});
  assert.equal(p.isPostPlaybackEchoEvent({type:'final',itemId:'echo',text:'这是上一段回答'}),true);
});
test('T52 announcement waits for audio drain, does not capture microphone, and stops cleanly', async () => {
  let emit, only, capture=0, drainedResolve;
  const source=new SimulatedCompanionAudioSource();source.start=async()=>{capture++;return {ok:true};};
  const sink=new SimulatedCompanionAudioSink();sink.drain=()=>new Promise(resolve=>{drainedResolve=resolve;});
  const controller=new CompanionConversationController({providerLabel:'three-stage',audioSource:source,audioSink:sink,providerFactory:options=>{emit=options.onEvent;only=options.announcementOnly;return {connect:async()=>({ok:true}),sayHello:()=>true,close(){},playbackDrained(){}};}});
  let settled=false; const result=controller.start({initialAnnouncement:'提醒你开会。',closeAfterAnnouncement:true,waitForAnnouncement:true}).then(value=>{settled=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(only,true);assert.equal(capture,0);
  emit({type:'tts.start'});emit({type:'audio',audio:Buffer.from([1,2])});emit({type:'tts.end'});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  drainedResolve({ok:true});assert.equal((await result).voice,true);await controller.eventChain;assert.equal(controller.snapshot().active,false);
});
test('T52 no-audio announcement cannot report success', async () => {
  let emit; const controller=new CompanionConversationController({providerLabel:'three-stage',audioSource:new SimulatedCompanionAudioSource(),audioSink:new SimulatedCompanionAudioSink(),providerFactory:options=>{emit=options.onEvent;return {connect:async()=>({ok:true}),sayHello:()=>true,close(){}};}});
  const result=controller.start({initialAnnouncement:'提醒你开会。',closeAfterAnnouncement:true,waitForAnnouncement:true});
  await new Promise(resolve=>setImmediate(resolve));emit({type:'tts.start'});emit({type:'tts.end'});assert.equal((await result).voice,false);await controller.eventChain;
});

test('T52 a full time reply retains purpose and fills missing date/time', t => {
  const store = storeFor(t), conversation = new PersonalReminderConversation({store, now: () => now});
  assert.equal(conversation.execute('提醒我去开会').type, 'clarify');
  assert.equal(conversation.execute('明天下午六点二十分').ok, true);
  const saved = store.snapshot().items[0];
  assert.equal(saved.title, '去开会');
  assert.equal(saved.remindAt, new Date(2026, 8, 16, 18, 20).getTime());
  conversation.execute('六点提醒我去取快递');
  assert.equal(conversation.execute('明天下午六点').ok, true);
  assert.equal(store.snapshot().items[1].remindAt, new Date(2026, 8, 16, 18).getTime());
});

test('T52 busy delivery queues without changing original time or using retry budget', t => {
  const store = storeFor(t);
  store.create({title: '开会', remindAt: now});
  const [item] = store.claimDue();
  store.finishDelivery(item.id, item.deliveryAttempt, {ok: false, queued: true});
  const pending = store.snapshot().items[0];
  assert.equal(pending.status, 'pending');
  assert.equal(pending.remindAt, now);
  assert.equal(pending.nextAttemptAt, now + 15000);
  assert.equal(pending.failureCount, 0);
});

test('T52 queued claimed reminders are not spoken after concurrent completion', async t => {
  const store = storeFor(t), spoken = [];
  store.create({title: '第一件事', remindAt: now});
  const second = store.create({title: '第二件事', remindAt: now});
  const scheduler = new PersonalReminderScheduler({store, now: () => now, schedule: () => ({unref(){}}), cancel(){}, onDue: async item => {
    spoken.push(item.id);
    store.complete(second.id);
    return {ok: true, voice: true};
  }});
  scheduler.start(); await scheduler.tick(); scheduler.stop();
  assert.equal(spoken.length, 1);
  assert.equal(store.snapshot().items[1].status, 'completed');
});

test('T52 missing start timing cannot release a delayed echo', () => {
  const provider = new ThreeStageCompanionProvider({asrFactory: () => ({}), modelFactory: () => ({}), ttsFactory: () => ({}), schedule: () => ({unref(){}}), cancelSchedule(){}});
  provider.handleAsrEvent({type: 'speech.started', itemId: 'echo', audioStartMs: 100});
  provider.asrAudioMs = 4000; provider.armPostPlaybackEchoTail('这是上一段回答');
  provider.handleAsrEvent({type: 'speech.started', itemId: 'echo', audioStartMs: null});
  assert.equal(provider.dropPostPlaybackEcho({type: 'final', itemId: 'echo', text: '这是上一段回答'}), true);
  assert.equal(provider.diagnostics().counters.postPlaybackEchoItemDrops, 1);
});

test('T52 standalone disconnect settles failure without reconnecting or capturing audio', async () => {
  let emit, captures = 0, connects = 0;
  const source = new SimulatedCompanionAudioSource();
  source.start = async () => { captures++; return {ok: true}; };
  const controller = new CompanionConversationController({providerLabel: 'three-stage', audioSource: source, audioSink: new SimulatedCompanionAudioSink(), providerFactory: options => {
    emit = options.onEvent;
    return {connect: async () => { connects++; return {ok: true}; }, sayHello: () => true, close(){}};
  }});
  const result = controller.start({initialAnnouncement: '提醒你开会。', closeAfterAnnouncement: true, waitForAnnouncement: true});
  await new Promise(resolve => setImmediate(resolve));
  emit({type: 'connection.closed'});
  assert.equal((await result).voice, false);
  await controller.eventChain;
  assert.equal(captures, 0); assert.equal(connects, 1);
  assert.equal(controller.snapshot().active, false);
});

test('T52 announcement in a conversation confirms drain and restores listening/volume', async () => {
  let emit;
  const sink = new SimulatedCompanionAudioSink(), volumes = [];
  sink.setVolume = async volume => { volumes.push(volume); return {ok: true}; };
  const controller = new CompanionConversationController({providerLabel: 'three-stage', audioSource: new SimulatedCompanionAudioSource(), audioSink: sink, providerFactory: options => {
    emit = options.onEvent;
    return {connect: async () => ({ok: true}), speakText: () => true, close(){}, playbackDrained(){}};
  }});
  await controller.start();
  const result = controller.announceAndWait('提醒你开会。', {volume: 0.2, restoreVolume: 0.7});
  await new Promise(resolve => setImmediate(resolve));
  emit({type: 'tts.start'}); emit({type: 'audio', audio: Buffer.from([1, 2])}); emit({type: 'tts.end'});
  assert.equal((await result).voice, true); await controller.eventChain;
  assert.equal(controller.snapshot().state, 'listening');
  assert.deepEqual(volumes, [0.2, 0.7]); await controller.stop();
});

test('T52 legacy records retain content and corrupted files do not create a timer loop', t => {
  const store = storeFor(t), item = store.create({title: '开会', remindAt: now});
  const legacy = {...item};
  for (const key of ['deliveryAttempt', 'failureCount', 'nextAttemptAt', 'deliveryError']) delete legacy[key];
  assert.equal(validateReminderState({version: 1, revision: 1, items: [legacy]}).items[0].title, '开会');
  store.snooze(item.id, 10);
  fs.writeFileSync(store.filePath, '{broken test fixture', 'utf8');
  const reopened = new PersonalReminderStore({userDataPath: path.dirname(store.filePath), now: () => now});
  let scheduled = 0;
  const scheduler = new PersonalReminderScheduler({store: reopened, schedule(){scheduled++;}});
  scheduler.start(); scheduler.stop();
  assert.equal(reopened.status().ready, false);
  assert.equal(scheduled, 0);
  assert.equal(fs.readFileSync(store.filePath, 'utf8'), '{broken test fixture');
});

test('T52 reminder diagnostics expose bounded outcomes, never title or utterance content', () => {
  const report = createDiagnosticReport({conversation: {intentBridge: {lastType: 'manage_personal_reminder', reminders: {
    draftActive: true, lastAction: 'clarify', lastReason: 'personal-reminder-time-ambiguous', title: '私密内容', text: '私密原话', delivery: {pending: 2, delivering: 1, failed: 5000, notified: -1, title: '私密内容'},
  }}, pipeline: {counters: {postPlaybackFreshSpeechStarts: 3, postPlaybackEchoItemDrops: 1, postPlaybackEchoTextDrops: 2, itemId: 'secret-id'}}}});
  assert.equal(report.conversation.intentBridge.lastType, 'manage_personal_reminder');
  assert.deepEqual(report.conversation.intentBridge.reminders.delivery, {pending: 2, delivering: 1, failed: 1000, notified: 0});
  assert.equal(report.conversation.pipeline.counters.postPlaybackFreshSpeechStarts, 3);
  assert.doesNotMatch(JSON.stringify(report), /私密|secret-id|itemId/);
});

test('T52 synchronous announcement rejection does not strand an active conversation in thinking', async () => {
  const controller = new CompanionConversationController({providerLabel: 'three-stage', audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(), providerFactory: () => ({
    connect: async () => ({ok: true}), speakText(){throw Error('synthetic send failure');}, close(){},
  })});
  await controller.start();
  assert.equal((await controller.announceAndWait('提醒你开会。')).voice, false);
  assert.equal(controller.snapshot().state, 'listening'); await controller.stop();
});
