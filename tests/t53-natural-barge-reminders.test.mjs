import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const {PersonalReminderConversation,parsePersonalReminderIntent:parse} = require('../electron/personal-reminders.cjs');
const {ThreeStageCompanionProvider,classifyRecognizedBargeIn} = require('../electron/three-stage-companion-provider.cjs');
const {CompanionIntentBridge} = require('../electron/companion-intent-bridge.cjs');
const {PersonalReminderStore,PersonalReminderScheduler}=require('../electron/personal-reminders.cjs');
const now = new Date(2026,8,15,19,30).getTime();
const at=(day,hour,minute=0)=>new Date(2026,8,day,hour,minute).getTime();
function conversation(options={}) {
  const saved=[]; const c=new PersonalReminderConversation({now:()=>now,store:{create:v=>{saved.push(v);return v;},deliveryStatus:()=>({})},...options});
  return {c,saved};
}
function provider() {
  let clock=0; const events=[];
  const p=new ThreeStageCompanionProvider({now:()=>clock,onEvent:e=>events.push(e),asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),schedule:()=>({unref(){}}),cancelSchedule(){}});
  p.playbackTail={id:1,assistantText:'我正在介绍如何种植花草',kind:'model'};
  p.handleAsrEvent({type:'speech.started',itemId:'human',audioStartMs:1000});
  return {p,events,time:v=>{clock=v;},partial:(text,confirmedText='')=>p.handleAsrEvent({type:'partial',itemId:'human',text,confirmedText})};
}
test('T53 polite creation, synonyms and capability are distinct',()=>{
  for(const phrase of ['你能明天下午六点提醒我开会吗','你可以明天下午六点提醒我开会吗','明天下午六点叫我开会','明天下午六点通知我开会']) {
    const r=parse(phrase,{now});assert.equal(r.type,'create');assert.equal(r.title,'开会');assert.equal(r.remindAt,at(16,18));
  }
  assert.equal(parse('你有没有提醒功能',{now}).type,'capability');
  assert.equal(parse('你能不能提醒我喝水',{now}).type,'clarify');
});
test('T53 relative reminders calculate from current clock',()=>{
  for(const [phrase,minutes] of [['十分钟后提醒我喝水',10],['半个小时后提醒我喝水',30],['两小时后提醒我喝水',120]]) {
    const r=parse(phrase,{now});assert.equal(r.remindAt,now+minutes*60000);assert.equal(r.title,'喝水');
  }
});
test('T53 nearby eight means today evening and never silent tomorrow morning',()=>{
  assert.equal(parse('一会儿八点钟提醒我开会',{now}).remindAt,at(15,20));
  assert.equal(parse('一会儿八点钟提醒我开会',{now:at(15,7,30)}).remindAt,at(15,8));
  assert.equal(parse('八点钟提醒我开会',{now}).type,'clarify');
  assert.equal(parse('下午六点提醒我开会',{now}).reason,'personal-reminder-time-in-past');
});
test('T53 short confirmation saves once with retained purpose',()=>{
  const {c,saved}=conversation();assert.match(c.execute('八点提醒我开会').answer,/今天20:00/);
  assert.equal(saved.length,0);assert.equal(c.claims('对'),true);assert.equal(c.execute('对').changed,true);
  assert.equal(saved[0].remindAt,at(15,20));assert.equal(saved[0].title,'开会');
  assert.equal(c.claims('对'),false);c.execute('对');assert.equal(saved.length,1);
});
test('T53 tomorrow morning correction preserves event and hour',()=>{
  const {c,saved}=conversation();c.execute('八点提醒我开会');assert.equal(c.claims('明早'),true);c.execute('明早');
  assert.equal(saved[0].remindAt,at(16,8));assert.equal(saved[0].title,'开会');
});
test('T53 missing time accepts a relative follow-up',()=>{
  const {c,saved}=conversation();c.execute('提醒我喝水');assert.equal(c.claims('十分钟后'),true);c.execute('十分钟后');
  assert.equal(saved[0].remindAt,now+600000);assert.equal(saved[0].title,'喝水');
});
test('T53 negated reminders and rejected confirmation cannot create',()=>{
  const {c,saved}=conversation();c.execute('今晚八点不要提醒我开会');assert.equal(saved.length,0);
  c.execute('八点提醒我开会');c.execute('不是');assert.equal(saved.length,0);c.execute('取消');c.execute('对');assert.equal(saved.length,0);
});
test('T53 keyword path does not wait for ordinary evidence floor',()=>{
  const f=provider();f.partial('停一下');assert.equal(f.events.filter(e=>e.type==='barge.start').length,1);assert.equal(f.p.counters.bargeInsAcceptedExplicit,1);
});
test('T53 confirmed ordinary short speech yields at 250 ms before final',()=>{
  const f=provider();f.time(250);f.partial('不是这样','不是这样');assert.equal(f.events.filter(e=>e.type==='barge.start').length,1);
  assert.equal(f.p.counters.bargeInsAcceptedPartial,1);assert.equal(f.p.pendingBargeInFinal.text,'不是这样');
});
test('T53 consistent distinct partials yield without keywords or a confirmed prefix',()=>{
  const f=provider();f.time(100);f.partial('我想问');assert.equal(f.p.counters.bargeInsAccepted,0);
  f.time(260);f.partial('我想问别的');assert.equal(f.p.counters.bargeInsAcceptedPartial,1);
});
test('T53 repeated partials preserve but do not manufacture stable evidence',()=>{
  const f=provider();f.time(50);f.partial('我想问');f.partial('我想问别的');assert.equal(f.p.speechEvidence.stablePartials,2);
  f.partial('我想问别的');assert.equal(f.p.speechEvidence.stablePartials,2);
  f.time(300);f.partial('我想问别的');assert.equal(f.p.counters.bargeInsAcceptedPartial,1);
  const g=provider();g.time(400);g.partial('我想问');g.partial('我想问');assert.equal(g.p.counters.bargeInsAccepted,0);
});
test('T53 no VAD-only, filler, numeric hallucination or assistant echo interruption',()=>{
  for(const text of ['嗯','咳嗽声','六五六','656','我正在介绍如何种植花草']) {
    const f=provider();f.time(600);f.partial(text,text);assert.equal(f.p.counters.bargeInsAccepted,0,text);
  }
  assert.equal(classifyRecognizedBargeIn('不是这样','我正在说别的').accepted,true);
});
test('T53 single partial with consistent short final can interrupt',()=>{
  const f=provider();f.partial('不是这样');f.p.handleAsrEvent({type:'speech.stopped',itemId:'human',audioEndMs:1500});
  assert.equal(f.p.finalSpeechEvidence('不是这样','human').accepted,true);
});
test('T53 speech crossing playback drain can continue with confirmed non-echo evidence',()=>{
  const f=provider();f.time(100);f.partial('我想问');f.p.playbackDrained();f.time(300);f.partial('我想问别的','我想问别的');
  assert.equal(f.p.postPlaybackEchoTail,null);assert.ok(f.events.some(e=>e.type==='asr.partial'&&e.text==='我想问别的'));
});
test('T53 clear reminder uses no semantic API',async()=>{
  let calls=0;const {c,saved}=conversation({requestJson:async()=>{calls++;throw Error('not needed');}});
  await c.executeAsync('今晚八点提醒我开会');assert.equal(calls,0);assert.equal(saved.length,1);
});
test('T53 semantic fallback receives bounded context and proposes before writing',async()=>{
  let request;const {c,saved}=conversation({recentContext:()=>[{role:'user',content:'明天下午六点要开会'}],requestJson:async r=>{request=r;return {canonicalText:'明天下午五点提醒我开会'};}});
  const r=await c.executeAsync('到时候提前一小时提醒我');assert.equal(r.type,'clarify');assert.equal(saved.length,0);
  assert.match(request.messages[1].content,/明天下午六点/);assert.match(request.messages[1].content,/localTime/);
  assert.equal((await c.executeAsync('对')).changed,true);assert.equal(saved[0].remindAt,at(16,17));
});
test('T53 stale semantic result after cancellation cannot write or create draft',async()=>{
  let resolve;const {c,saved}=conversation({requestJson:()=>new Promise(r=>{resolve=r;})});
  const request=c.executeAsync('到时候提醒我');c.execute('取消');resolve({canonicalText:'今晚八点提醒我开会'});
  assert.equal((await request).reason,'personal-reminder-stale');assert.equal(saved.length,0);assert.equal(c.activeDraft(),null);
});
test('T53 invalid/failed semantic extraction never claims a saved reminder',async()=>{
  for(const requestJson of [async()=>{throw Error('network');},async()=>({canonicalText:42})]) {
    const {c,saved}=conversation({requestJson});const r=await c.executeAsync('到时候提醒我');assert.equal(saved.length,0);assert.match(r.answer,/没有保存/);
  }
});
test('T53 bridge owns natural request and short confirmation without generic classifier',async()=>{
  const {c,saved}=conversation();const bridge=new CompanionIntentBridge({reminderClaims:s=>c.claims(s),reminderAction:s=>c.executeAsync(s),requestJson:()=>{throw Error('generic classifier forbidden');}});
  assert.equal(bridge.claimsTurn('八点提醒我开会'),true);await bridge.analyze('八点提醒我开会');
  assert.equal(bridge.claimsTurn('对'),true);await bridge.analyze('对');assert.equal(saved.length,1);
});
test('T53 conversational correction accepts 就是明早 without repeating purpose',()=>{
  const {c,saved}=conversation();c.execute('八点提醒我开会');assert.equal(c.claims('就是明早'),true);c.execute('就是明早');
  assert.equal(saved[0].title,'开会');assert.equal(saved[0].remindAt,at(16,8));
});
test('T53 invalid date and past date cannot silently create future reminders',()=>{
  assert.equal(parse('九月三十一号晚上八点提醒我开会',{now}).reason,'personal-reminder-date-invalid');
  assert.equal(parse('昨天晚上八点提醒我开会',{now}).reason,'personal-reminder-time-in-past');
});
test('T53 vague purpose is not saved before context extraction is confirmed',async()=>{
  const {c,saved}=conversation({requestJson:async()=>({canonicalText:'今晚八点提醒我开会'})});
  assert.equal((await c.executeAsync('今晚八点提醒我那个事')).type,'clarify');assert.equal(saved.length,0);
  await c.executeAsync('对');assert.equal(saved[0].title,'开会');
});
test('T53 semantic proposal expires before an affirmative can write it',async()=>{
  let clock=now;const {c,saved}=conversation({now:()=>clock,requestJson:async()=>({canonicalText:'今晚八点提醒我开会'})});
  await c.executeAsync('到时候提醒我');clock+=120001;await c.executeAsync('对');assert.equal(saved.length,0);
});
test('T53 natural voice route persists to dashboard and due scheduler claims the same record',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-t53-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let clock=now;const store=new PersonalReminderStore({userDataPath:dir,now:()=>clock});
  const c=new PersonalReminderConversation({store,now:()=>clock});
  const bridge=new CompanionIntentBridge({reminderClaims:s=>c.claims(s),reminderAction:s=>c.executeAsync(s)});
  const r=await bridge.analyze('你能十分钟后提醒我喝水吗');assert.equal(r.result.ok,true);
  const item=store.dashboardSnapshot().items[0];assert.equal(item.title,'喝水');assert.equal(item.remindAt,now+600000);
  const deliveries=[];const scheduler=new PersonalReminderScheduler({store,now:()=>clock,schedule:()=>({unref(){}}),cancel(){},onDue:async row=>{deliveries.push(row.id);return {ok:true,voice:true};}});
  scheduler.start();await scheduler.tick();assert.equal(deliveries.length,0);
  clock+=600000;await scheduler.tick();scheduler.stop();assert.deepEqual(deliveries,[item.id]);
  assert.equal(store.snapshot().items[0].status,'notified'); // simulated audio acknowledgement, not physical speaker acceptance
});
