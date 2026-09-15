import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PersonalReminderStore,PersonalReminderConversation,PersonalReminderScheduler}=require('../electron/personal-reminders.cjs');
const now=new Date(2026,8,16,10).getTime();
function conversation(requestJson, clock=()=>now) {
  const saved=[];
  const c=new PersonalReminderConversation({now:clock,requestJson,store:{create:r=>{saved.push(r);return r;}}});
  return {c,saved};
}

test('T57 mixed chat is extracted before persistence without granting model control of time',async()=>{
  let calls=0;
  const {c,saved}=conversation(async args=>{calls++;assert.equal(saved.length,0);assert.equal(args.timeoutMs,6000);return {title:'喝水',remindAt:0};});
  const result=await c.executeAsync('挺好笑的，然后一分钟后提醒我喝个水吧');
  assert.equal(result.ok,true);assert.equal(calls,1);assert.equal(saved.length,1);
  assert.equal(saved[0].title,'喝水');assert.equal(saved[0].remindAt,now+60000);
  assert.match(result.answer,/已经记下“喝水”/);
});

test('T57 mixed purpose-only reply keeps the pending clock and saves only the action',async()=>{
  const {c,saved}=conversation(async()=>({title:'喝水'}));
  c.execute('一分钟后提醒我');
  assert.equal(c.claims('挺好笑的，你你帮我设置喝个水吧'),true);
  const result=await c.executeAsync('挺好笑的，你你帮我设置喝个水吧');
  assert.equal(result.ok,true);assert.equal(saved[0].title,'喝水');assert.equal(saved[0].remindAt,now+60000);
});

test('T57 straightforward reminder stays local and has no additional API latency',async()=>{
  const {c,saved}=conversation(()=>{throw Error('unexpected API');});
  assert.equal((await c.executeAsync('一分钟后提醒我喝水')).ok,true);assert.equal(saved.length,1);
});

test('T57 setting is a substantive action, not always a reminder wrapper',async()=>{
  const {c,saved}=conversation(()=>{throw Error('unexpected API');});
  assert.equal((await c.executeAsync('一分钟后提醒我打开设置')).ok,true);
  assert.equal(saved[0].title,'打开设置');
});

test('T57 extraction failures never save raw chat, and a short reply reuses validated time',async()=>{
  for(const response of [null,{title:''},{title:'吃饭'},{title:'挺好笑的 帮我设置喝水'}]) {
    const {c,saved}=conversation(async()=>response);
    const result=await c.executeAsync('挺好笑的，一分钟后提醒我喝水');
    assert.equal(result.type,'clarify');assert.equal(saved.length,0);
    assert.equal((await c.executeAsync('喝水')).ok,true);assert.equal(saved[0].remindAt,now+60000);
  }
});

test('T57 network failure preserves distinct event time for the purpose follow-up',async()=>{
  const {c,saved}=conversation(async()=>{throw Error('network');});
  await c.executeAsync('挺好笑的，明天下午四点开会，下午一点提醒我');
  const result=await c.executeAsync('开会');assert.equal(result.ok,true);
  assert.equal(saved[0].eventAt,new Date(2026,8,17,16).getTime());
  assert.equal(saved[0].remindAt,new Date(2026,8,17,13).getTime());
});

test('T57 model cannot discard action negation or numeric quantity',async()=>{
  for(const [purpose,title] of [['不要锁门','锁门'],['喝200毫升水','喝水']]) {
    const {c,saved}=conversation(async()=>({title}));
    await c.executeAsync(`挺好笑的，一分钟后提醒我${purpose}`);assert.equal(saved.length,0);
  }
});

test('T57 cancellation and expiry invalidate an in-flight purpose extraction',async()=>{
  for(const expire of [false,true]) {
    let clock=now,resolve;
    const {c,saved}=conversation(()=>new Promise(r=>resolve=r),()=>clock);
    const pending=c.executeAsync('挺好笑的，一分钟后提醒我喝水');
    if(expire)clock+=120001;else c.execute('取消');
    resolve({title:'喝水'});assert.equal((await pending).reason,'personal-reminder-stale');assert.equal(saved.length,0);
  }
});

function withStore(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-t57-'));
  try {return fn(new PersonalReminderStore({userDataPath:dir,now:()=>now}),dir);}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('T57 delete persists only the selected reminder and survives restart',()=>withStore((store,dir)=>{
  const a=store.create({title:'喝水',remindAt:now+60000});const b=store.create({title:'开会',remindAt:now+120000});
  assert.equal(store.remove(a.id).removed,true);
  assert.deepEqual(new PersonalReminderStore({userDataPath:dir,now:()=>now}).snapshot().items.map(r=>r.id),[b.id]);
  assert.equal(store.nextPendingDue().id,b.id);assert.throws(()=>store.remove(a.id),/not-found/);
}));
test('T57 removed due item is not claimed and stale completion cannot recreate it',()=>withStore(store=>{
  const a=store.create({title:'喝水',remindAt:now});store.remove(a.id);
  assert.deepEqual(store.claimDue(now),[]);assert.equal(store.finishDelivery(a.id,1,{ok:true,voice:true}).ignored,true);
}));
test('T57 deletion rejects active speech and permits deletion once notified',()=>withStore(store=>{
  const a=store.create({title:'喝水',remindAt:now});const [claim]=store.claimDue(now);
  assert.throws(()=>store.remove(a.id),/delivering/);
  store.finishDelivery(a.id,claim.deliveryAttempt,{ok:true,voice:true});store.remove(a.id);
  assert.equal(store.snapshot().items.length,0);
}));
test('T57 failed persistence leaves reminder intact and retryable',()=>withStore(store=>{
  const a=store.create({title:'喝水',remindAt:now+60000});const persist=store.persist;
  store.persist=()=>{throw Error('disk-full');};assert.throws(()=>store.remove(a.id),/disk-full/);
  assert.equal(store.snapshot().items.length,1);store.persist=persist;store.remove(a.id);
}));
test('T57 rearming after deletion cancels the timer and targets the remaining item',()=>withStore(store=>{
  const a=store.create({title:'喝水',remindAt:now+60000});store.create({title:'休息',remindAt:now+120000});
  const delays=[],cancelled=[];
  const scheduler=new PersonalReminderScheduler({store,now:()=>now,schedule:(_,ms)=>{delays.push(ms);return delays.length;},cancel:id=>cancelled.push(id)});
  scheduler.start();store.remove(a.id);scheduler.reschedule();
  assert.deepEqual(delays,[60000,120000]);assert.deepEqual(cancelled,[1]);scheduler.stop();
}));
