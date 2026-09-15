const assert=require('node:assert/strict');
const {load,verify}=require('./verify-t53-natural-package.cjs');
async function check(){
  await verify();
  assert.equal(load('electron/companion-preferences.cjs').COMPANION_PREFERENCES_DEFAULT.endSmoothWindowMs,500);
  const {ThreeStageCompanionProvider}=load('electron/three-stage-companion-provider.cjs');
  let now=0;const timers=[];
  const p=new ThreeStageCompanionProvider({now:()=>now,shouldBypassModel:()=>true,asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),schedule:(callback,ms)=>{const h={callback,ms,cancelled:false,unref(){}};timers.push(h);return h;},cancelSchedule:h=>{if(h)h.cancelled=true;}});
  const emit=e=>p.handleAsrEvent({itemId:'synthetic',...e});
  p.playbackTail={id:1,assistantText:'先听我讲一个故事',kind:'model'};
  emit({type:'speech.started',audioStartMs:100});now=300;
  emit({type:'partial',text:'我想问另外的事情',confirmedText:'我想问另外的事情'});
  emit({type:'speech.stopped',audioEndMs:800});
  const end=timers.at(-1);assert.equal(end.ms,600);assert.equal(p.speechEvidence.receivedStopAt,300);
  emit({type:'partial',text:'我想问另外的事情',confirmedText:'我想问另外的事情'});assert.equal(timers.at(-1),end);
  now=900;end.callback();assert.equal(p.counters.bargeFinalRecoveries,1);
  console.log('T54 final-ASAR verified: 500 ms default, stop ownership, 600 ms ended grace and no duplicate rearming.');
}
check().catch(error=>{console.error(error);process.exitCode=1;});
