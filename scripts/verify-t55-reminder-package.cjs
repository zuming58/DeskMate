// Only extracted pure modules, synthetic clock/data, no main or production profile.
const assert=require('node:assert/strict');
const {load,verify}=require('./verify-t53-natural-package.cjs');
async function check(){
  await verify();
  const {PersonalReminderConversation,parsePersonalReminderIntent:parse}=load('electron/personal-reminders.cjs');
  const {CompanionIntentBridge}=load('electron/companion-intent-bridge.cjs');
  const now=new Date(2026,8,15,21,39).getTime(),saved=[];
  assert.equal(parse('今晚九点四十五提醒我喝水',{now}).remindAt,new Date(2026,8,15,21,45).getTime());
  const c=new PersonalReminderConversation({now:()=>now,store:{create:r=>{saved.push(r);return r;},deliveryStatus:()=>({})}});
  const bridge=new CompanionIntentBridge({appActions:{listRegistered:()=>[]},reminderClaims:s=>c.claims(s),reminderAction:s=>c.executeAsync(s),requestJson:()=>{throw Error('unexpected cloud call');}});
  await bridge.analyze('下午六点提醒我开会');assert.equal(bridge.status().status,'awaiting-details');
  assert.equal(bridge.claimsTurn('我说的是明天下午六点'),true);await bridge.analyze('我说的是明天下午六点');
  assert.equal(saved[0].remindAt,new Date(2026,8,16,18).getTime());assert.equal(saved[0].title,'开会');
  assert.equal(load('electron/companion-preferences.cjs').COMPANION_PREFERENCES_DEFAULT.endSmoothWindowMs,500);
  const {ThreeStageCompanionProvider}=load('electron/three-stage-companion-provider.cjs');
  let claimed=true,models=0;
  const p=new ThreeStageCompanionProvider({asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),shouldBypassModel:()=>claimed,onEvent:e=>{if(e.type==='asr.final')claimed=false;}});
  p.runModelTurn=()=>{models++;};p.handleAsrEvent({type:'final',text:'明天的这个时间',itemId:'synthetic'});assert.equal(models,0);assert.equal(p.counters.trustedBypasses,1);
  console.log('T55 final-ASAR passed: colloquial minutes, trusted follow-up, waiting vs saved, retained purpose, fixed final-ownership race and unchanged 500 ms.');
}
check().catch(error=>{console.error(error);process.exitCode=1;});
