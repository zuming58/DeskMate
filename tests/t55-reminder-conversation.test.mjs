import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createDiagnosticReport} from '../src/services/diagnostics.js';
const require=createRequire(import.meta.url);
const {PersonalReminderConversation,PersonalReminderStore,PersonalReminderScheduler,parsePersonalReminderIntent:parse}=require('../electron/personal-reminders.cjs');
const {CompanionIntentBridge}=require('../electron/companion-intent-bridge.cjs');
const {CompanionConversationController}=require('../electron/companion-conversation.cjs');
const {ThreeStageCompanionProvider}=require('../electron/three-stage-companion-provider.cjs');
const {SimulatedCompanionAudioSource,SimulatedCompanionAudioSink}=require('../electron/companion-audio.cjs');
const now=new Date(2026,8,15,21,39).getTime();
const at=(day,hour,minute=0)=>new Date(2026,8,day,hour,minute).getTime();
function fixture(options={}) {
  const saved=[];const c=new PersonalReminderConversation({now:()=>now,store:{create:v=>{saved.push(v);return v;},deliveryStatus:()=>({})},...options});
  const bridge=new CompanionIntentBridge({appActions:{listRegistered:()=>[]},reminderClaims:text=>c.claims(text),reminderAction:text=>c.executeAsync(text),requestJson:()=>{throw Error('unexpected classifier');}});
  return {c,saved,bridge};
}

test('T55 spoken minutes with or without 分 produce the same complete time and clean purpose',()=>{
  for(const phrase of ['今晚九点四十五提醒我喝水','今晚九点四十五分提醒我喝水','今晚9点45提醒我喝水','今晚21:45提醒我喝水','今晚九点三刻提醒我喝水']) {
    const r=parse(phrase,{now});assert.equal(r.type,'create',phrase);assert.equal(r.remindAt,at(15,21,45));assert.equal(r.title,'喝水');
  }
  assert.equal(parse('明天下午六点一刻提醒我开会',{now}).remindAt,at(16,18,15));
});

test('T55 invalid minutes and hours cannot silently become another valid time',()=>{
  for(const phrase of ['明天25点提醒我开会','今晚九点六十五提醒我喝水','明天21:99提醒我喝水','明天下午六点一百提醒我开会']) {
    assert.equal(parse(phrase,{now}).reason,'personal-reminder-time-invalid',phrase);
  }
  assert.equal(parse('今天晚上九点提醒我喝水',{now}).reason,'personal-reminder-time-in-past');
});

test('T55 near-term one-minute voice requests stay local',async()=>{
  for(const phrase of ['一分钟后提醒我喝水','过一分钟提醒我喝水','再过一分钟提醒我喝水']) {
    const f=fixture({requestJson:()=>{throw Error('must stay local');}});const result=await f.bridge.analyze(phrase);
    assert.equal(result.result.ok,true,phrase);assert.equal(f.saved[0].remindAt,now+60000);assert.equal(f.saved[0].title,'喝水');
  }
});

test('T55 a valid clock correction replaces an invalid clock instead of keeping it forever',async()=>{
  for(const initial of ['今晚九点六十五提醒我喝水','今晚25点提醒我喝水','今晚九点一百提醒我喝水']) {
    const f=fixture();await f.bridge.analyze(initial);const r=await f.bridge.analyze('我说的是晚上九点四十五');
    assert.equal(r.result.ok,true,initial);assert.equal(f.saved[0].remindAt,at(15,21,45));assert.equal(f.saved[0].title,'喝水');
  }
});

test('T55 natural date corrections stay inside production reminder claims and retain purpose',async()=>{
  for(const reply of ['我说的是明天下午六点','明天的这个时间','我的意思是明天','那你明天这个时间提醒我吧']) {
    const f=fixture();await f.bridge.analyze('下午六点提醒我开会');assert.equal(f.bridge.claimsTurn(reply),true,reply);
    const r=await f.bridge.analyze(reply);assert.equal(r.result.ok,true,reply);assert.equal(f.saved[0].remindAt,at(16,18));assert.equal(f.saved[0].title,'开会');
  }
});

test('T55 correcting only minutes preserves an explicit evening period',async()=>{
  const f=fixture();await f.bridge.analyze('今晚九点提醒我喝水');await f.bridge.analyze('我说的是九点四十五');
  assert.equal(f.saved[0].remindAt,at(15,21,45));
});

test('T55 date-only correction replaces yesterday instead of leaving an old absolute date',async()=>{
  for(const initial of ['昨天下午六点提醒我开会','2026年9月14日下午六点提醒我开会']) {
    const f=fixture();await f.bridge.analyze(initial);await f.bridge.analyze('明天的这个时间');assert.equal(f.saved[0].remindAt,at(16,18));
  }
});

test('T55 reminder clock correction retains separate event clock',async()=>{
  const f=fixture();await f.bridge.analyze('今天下午四点有活动，下午一点提醒我');await f.bridge.analyze('我说的是明天');
  assert.equal(f.saved[0].remindAt,at(16,13));assert.equal(f.saved[0].eventAt,at(16,16));assert.equal(f.saved[0].title,'活动');
});

test('T55 Workbench save request cannot override missing or elapsed time',async()=>{
  const f=fixture();await f.bridge.analyze('下午六点提醒我开会');const reply='你帮我加到工作台里';assert.equal(f.bridge.claimsTurn(reply),true);
  const r=await f.bridge.analyze(reply);assert.equal(r.result.waiting,true);assert.equal(f.saved.length,0);assert.match(r.result.answer,/还没有保存/);
  assert.equal(f.bridge.status().status,'awaiting-details');
});

test('T55 Workbench confirmation uses valid proposal once and stops claiming after save',async()=>{
  const f=fixture();await f.bridge.analyze('明天六点提醒我开会');const reply='帮我保存到工作台上';
  assert.equal(f.bridge.claimsTurn(reply),true);await f.bridge.analyze(reply);assert.equal(f.saved.length,1);assert.equal(f.bridge.claimsTurn(reply),false);
});

test('T55 unrelated chat, negation, cancellation and expiry never complete pending reminders',async()=>{
  let clock=now;const f=fixture({now:()=>clock});await f.bridge.analyze('下午六点提醒我开会');
  for(const phrase of ['我明天下午六点想听个笑话','明天的天气怎么样','别帮我加到工作台里']) assert.equal(f.bridge.claimsTurn(phrase),false,phrase);
  await f.bridge.analyze('取消');assert.equal(f.c.claims('我说的是明天'),false);
  await f.bridge.analyze('下午六点提醒我开会');clock+=120001;assert.equal(f.c.claims('明天的这个时间'),false);assert.equal(f.saved.length,0);
});

test('T55 persistence failure never says saved and remains distinct from clarification',async()=>{
  const f=fixture({store:{create:()=>{throw Error('synthetic disk full');},deliveryStatus:()=>({})}});
  const r=await f.bridge.analyze('一分钟后提醒我喝水');assert.equal(r.ok,false);assert.equal(r.result.ok,false);assert.match(r.result.answer,/没有保存成功/);assert.equal(f.bridge.status().status,'failed');
});

test('T55 waiting diagnostics contain no pending content',()=>{
  const r=createDiagnosticReport({conversation:{intentBridge:{lastStatus:'awaiting-details',lastType:'manage_personal_reminder',reminders:{draftActive:true,lastAction:'clarify',text:'secret-content'}}}});
  assert.equal(r.conversation.intentBridge.lastStatus,'awaiting-details');assert.doesNotMatch(JSON.stringify(r),/secret-content/);
});

test('T55 trusted confirmation cannot start free chat after synchronous draft clearing',()=>{
  let claimed=true,models=0;
  const p=new ThreeStageCompanionProvider({asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),shouldBypassModel:()=>claimed,onEvent:e=>{if(e.type==='asr.final')claimed=false;}});
  p.runModelTurn=()=>{models++;};p.handleAsrEvent({type:'final',text:'明天的这个时间',itemId:'synthetic'});
  assert.equal(models,0);assert.equal(p.counters.trustedBypasses,1);
});

test('T55 voice bridge persists and due scheduler waits for controller audio drain before notified',async t=>{
  let clock=now;const root=fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-t55-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=new PersonalReminderStore({userDataPath:root,now:()=>clock});const f=fixture({store,now:()=>clock});
  await f.bridge.analyze('过一分钟提醒我喝水');assert.equal(store.dashboardSnapshot(clock).items[0].title,'喝水');
  assert.equal(new PersonalReminderStore({userDataPath:root,now:()=>clock}).snapshot().items.length,1);
  let emit,captures=0,releaseDrain;const source=new SimulatedCompanionAudioSource();source.start=async()=>{captures++;return {ok:true};};
  const sink=new SimulatedCompanionAudioSink();sink.drain=()=>new Promise(resolve=>{releaseDrain=()=>resolve({ok:true});});
  const controller=new CompanionConversationController({providerLabel:'three-stage',audioSource:source,audioSink:sink,providerFactory:options=>{emit=options.onEvent;return {connect:async()=>({ok:true}),sayHello:()=>true,close(){}};}});
  const scheduler=new PersonalReminderScheduler({store,now:()=>clock,schedule:()=>({unref(){}}),cancel(){},onDue:item=>controller.start({initialAnnouncement:`提醒你：${item.title}。`,closeAfterAnnouncement:true,waitForAnnouncement:true})});
  t.after(()=>{scheduler.stop();return controller.stop();});scheduler.start();await scheduler.tick();assert.equal(emit,undefined);
  clock+=60000;const delivery=scheduler.tick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.snapshot().items[0].status,'delivering');emit({type:'tts.start'});emit({type:'audio',audio:Buffer.from([1,2])});emit({type:'tts.end'});
  for(let i=0;i<10&&!releaseDrain;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof releaseDrain,'function');assert.equal(store.snapshot().items[0].status,'delivering');releaseDrain();await delivery;
  assert.equal(store.snapshot().items[0].status,'notified');assert.equal(captures,0);assert.equal(sink.chunks.length>0,true);
  await scheduler.tick();assert.equal(store.snapshot().items[0].deliveryAttempt,1);
});
