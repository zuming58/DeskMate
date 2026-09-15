import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {COMPANION_DEFAULTS} from '../src/domain/companionPreferences.js';
const require=createRequire(import.meta.url);
const {ThreeStageCompanionProvider}=require('../electron/three-stage-companion-provider.cjs');
const {COMPANION_PREFERENCES_DEFAULT,normalizeCompanionPreferences}=require('../electron/companion-preferences.cjs');
const {BailianStreamingAsrAdapter}=require('../electron/streaming-asr-adapter.cjs');
function fixture(confirmed='我想问另外的事情') {
  let now=0;const timers=[],events=[];
  const p=new ThreeStageCompanionProvider({now:()=>now,onEvent:e=>events.push(e),shouldBypassModel:()=>true,asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),schedule:(callback,ms)=>{const h={callback,ms,cancelled:false,unref(){}};timers.push(h);return h;},cancelSchedule:h=>{if(h)h.cancelled=true;}});
  p.playbackTail={id:1,assistantText:'我正在讲一个长故事',kind:'model'};
  const emit=e=>p.handleAsrEvent({itemId:'current',...e});
  emit({type:'speech.started',audioStartMs:100});now=300;
  emit({type:'partial',text:'我想问另外的事情',confirmedText:confirmed});
  const active=()=>timers.filter(t=>!t.cancelled).at(-1);
  return {p,events,timers,emit,active,time:v=>{now=v;}};
}
test('T54 500 ms defaults agree without migrating custom saved values',()=>{
  assert.equal(COMPANION_DEFAULTS.endSmoothWindowMs,500);
  assert.equal(COMPANION_PREFERENCES_DEFAULT.endSmoothWindowMs,500);
  assert.equal(normalizeCompanionPreferences({endSmoothWindowMs:1500}).endSmoothWindowMs,1500);
});
test('T54 configured 500 ms reaches the existing ASR session',async()=>{
  let options;const a=new BailianStreamingAsrAdapter({silenceDurationMs:500,sessionFactory:o=>{options=o;return {start:async()=>({ok:true}),cancel(){}};}});
  await a.connect();assert.equal(options.silenceDurationMs,500);a.close();
});
test('T54 accepted interruption keeps current speech evidence and records stop',()=>{
  const f=fixture();assert.equal(f.p.speechEvidence.active,true);f.time(900);f.emit({type:'speech.stopped',audioEndMs:1000});
  assert.equal(f.p.speechEvidence.receivedStopAt,900);assert.equal(f.p.pendingBargeInFinal.stopped,true);assert.equal(f.active().ms,600);
});
test('T54 identical partial storm does not rearm the deadline before or after stop',()=>{
  const f=fixture();const first=f.active();assert.equal(first.ms,2500);
  for(let i=0;i<20;i++) f.emit({type:'partial',text:'我想问另外的事情',confirmedText:'我想问另外的事情'});
  assert.equal(f.active(),first);f.emit({type:'speech.stopped',audioEndMs:1200});const end=f.active();
  for(let i=0;i<20;i++) f.emit({type:'partial',text:'我想问另外的事情',confirmedText:'我想问另外的事情'});
  assert.equal(f.active(),end);assert.equal(end.ms,600);
  f.time(1200);f.emit({type:'partial',text:'我想问另外的事情'});assert.equal(f.active(),end);
});
test('T54 confirmed ended text recovers after 600 ms with recorded timing and no duplicate final',()=>{
  const f=fixture();f.time(1000);f.emit({type:'speech.stopped',audioEndMs:1100});f.time(1600);f.active().callback();
  assert.equal(f.p.counters.bargeFinalRecoveries,1);assert.equal(f.p.lastTiming.speechStopToFinalMs,600);
  assert.equal(f.events.filter(e=>e.type==='asr.final').length,1);f.emit({type:'final',text:'我想问另外的事情'});
  assert.equal(f.events.filter(e=>e.type==='asr.final').length,1);
});
test('T54 unconfirmed suffix is neither truncated nor promoted as a complete utterance',()=>{
  const f=fixture('我想问另外');f.emit({type:'speech.stopped',audioEndMs:1100});f.active().callback();
  assert.equal(f.p.counters.bargeFinalRecoveries,0);assert.equal(f.events.filter(e=>e.type==='asr.final').length,0);
  assert.ok(f.events.some(e=>e.type==='barge.final-missing'));
});
test('T54 actual continuing text rearms missing-stop deadline, preserving latest complete text',()=>{
  const f=fixture();const first=f.active();f.time(1800);f.emit({type:'partial',text:'我想问另外的事情还有明天的安排',confirmedText:'我想问另外的事情还有明天的安排'});
  assert.equal(first.cancelled,true);assert.equal(f.active().ms,2500);
  first.callback();assert.equal(f.p.counters.bargeFinalRecoveries,0);
  f.emit({type:'speech.stopped',audioEndMs:2200});f.active().callback();
  assert.equal(f.events.find(e=>e.type==='asr.final').text,'我想问另外的事情还有明天的安排');
});
test('T54 resumed same item cancels stopped grace and cannot promote stale text',()=>{
  const f=fixture();f.emit({type:'speech.stopped',audioEndMs:1000});const end=f.active();
  f.emit({type:'speech.started',audioStartMs:1200});assert.equal(end.cancelled,true);assert.equal(f.active().ms,2500);
  assert.equal(f.p.pendingBargeInFinal.stopped,false);end.callback();assert.equal(f.p.counters.bargeFinalRecoveries,0);
  f.active().callback();assert.equal(f.p.counters.bargeFinalRecoveries,0);
});
test('T54 new item and close invalidate stale recovery callbacks',()=>{
  for(const action of ['new','close']) {
    const f=fixture();f.emit({type:'speech.stopped',audioEndMs:1000});const end=f.active();
    if(action==='new')f.emit({type:'speech.started',itemId:'other',audioStartMs:2000});else f.p.close();
    end.callback();assert.equal(f.p.counters.bargeFinalRecoveries,0);
  }
});
test('T54 normal final wins the grace race and duplicate stop does not reset it',()=>{
  const f=fixture();f.emit({type:'speech.stopped',audioEndMs:1000});const end=f.active();f.emit({type:'speech.stopped',audioEndMs:1000});assert.equal(f.active(),end);
  f.emit({type:'final',text:'我想问另外的事情'});assert.equal(end.cancelled,true);end.callback();assert.equal(f.p.counters.bargeFinalRecoveries,0);
  assert.equal(f.events.filter(e=>e.type==='asr.final').length,1);
});
