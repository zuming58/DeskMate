import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parsePersonalReminderIntent:parse,PersonalReminderConversation,formatPersonalReminderAnnouncement:format}=require('../electron/personal-reminders.cjs');
const now=new Date(2026,8,15,10).getTime();

test('T56 reminder request fillers never enter the saved purpose',()=>{
  for(const phrase of ['一分钟后提醒我一下喝水','嗯，一分钟后提醒我一下喝水','一分钟后提醒，嗯，提醒我一下喝水','一分钟后提醒我，呃，一下喝水','一分钟后提醒我一下，嗯，喝水']) {
    const r=parse(phrase,{now});assert.equal(r.type,'create',phrase);assert.equal(r.title,'喝水',phrase);assert.equal(r.remindAt,now+60000);
  }
});

test('T56 substantive 一下, names, amounts and negation remain intact',()=>{
  for(const title of ['看一下合同','不要锁门','喝200毫升水','联系啊哈实验室','练习嗯哼发声']) {
    assert.equal(parse(`一分钟后提醒我${title}`,{now}).title,title);
    assert.match(format({title}),new RegExp(title));
  }
});

test('T56 filler-only purpose asks for content and never invents a task',()=>{
  const r=parse('一分钟后提醒我一下，嗯，呃，啊',{now});assert.equal(r.type,'clarify');assert.equal(r.reason,'personal-reminder-title-missing');
});

test('T56 purpose follow-up is cleaned before store receipt and saved confirmation',()=>{
  const saved=[];const c=new PersonalReminderConversation({now:()=>now,store:{create:r=>{saved.push(r);return r;}}});
  c.execute('一分钟后提醒我');assert.equal(c.claims('嗯，喝水'),true);const r=c.execute('嗯，喝水');
  assert.equal(saved[0].title,'喝水');assert.match(r.answer,/已经记下“喝水”/);assert.doesNotMatch(r.answer,/嗯/);
});

test('T56 due speech uses current configured address, with neutral absent-name fallback',()=>{
  assert.equal(format({title:'喝水'},{ownerName:'测试称呼'}),'测试称呼，喝水时间到了。');
  assert.equal(format({title:'喝水'}),'喝水时间到了。');
  assert.equal(format({title:'看一下合同'},{ownerName:'朋友'}),'朋友，提醒时间到了：看一下合同。');
});

test('T56 advance notice does not announce that a later event has begun',()=>{
  assert.equal(format({title:'开会',remindAt:now,eventAt:now+3600000},{ownerName:'朋友'}),'朋友，提醒时间到了：开会。');
  assert.equal(format({title:'开会',remindAt:now,eventAt:now}),'开会时间到了。');
});

test('T56 old separated filler title is cleaned for speech without rewriting the record',()=>{
  const old=Object.freeze({title:'嗯 一下 喝水',remindAt:now,eventAt:now});
  assert.equal(format(old,{ownerName:'朋友'}),'朋友，喝水时间到了。');assert.equal(old.title,'嗯 一下 喝水');
  assert.equal(format({title:'嗯 呃'}),'');
});

test('T56 output stays bounded and does not insert control characters from stored fields',()=>{
  const text=format({title:'合同'.repeat(200)},{ownerName:'朋友\u0000'.repeat(40)});
  assert.ok(text.length<=240);assert.doesNotMatch(text,/[\u0000-\u001f]/u);
});
