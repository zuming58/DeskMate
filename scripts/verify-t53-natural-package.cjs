// Executes only packaged pure modules with synthetic data; never production main.
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const asar = require('@electron/asar');
const release = process.argv[2] || 'release-t53';
assert(/^release(?:-[a-z0-9-]+)?$/.test(release));
const archive = path.resolve(__dirname,'..',release,'win-unpacked/resources/app.asar');
const cache = new Map();
function load(file) {
  if(cache.has(file)) return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const localRequire=request=>request.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),request))):require(request);
  vm.runInThisContext(`(function(require,module,exports){${asar.extractFile(archive,path.normalize(file)).toString('utf8')}\n})`,{filename:file})(localRequire,module,module.exports);
  return module.exports;
}
async function verify() {
  assert.match(asar.extractFile(archive,'electron/main.cjs').toString(),/t53-natural-barge-reminders|t54-fast-endpoint|t55-reminder-conversation|t56-reminder-wording|t57-reminder-purpose-delete|t58-dance-music-lifetime|t59-vocabulary-ui-polish|t60-hotword-normalization|t61-style-studio-s4-return|t62-style-studio-chinese-labels|t63-style-studio-drag-feedback|t64-child-pipe-recovery/);
  const {PersonalReminderConversation,parsePersonalReminderIntent:parse}=load('electron/personal-reminders.cjs');
  const now=new Date(2026,8,15,19,30).getTime();
  assert.equal(parse('你能明天下午六点提醒我开会吗',{now}).title,'开会');
  assert.equal(parse('一会儿八点提醒我开会',{now}).remindAt,new Date(2026,8,15,20).getTime());
  assert.equal(parse('十分钟后提醒我喝水',{now}).remindAt,now+600000);
  const saved=[];const c=new PersonalReminderConversation({now:()=>now,store:{create:r=>{saved.push(r);return r;}}});
  await c.executeAsync('八点提醒我开会');assert.equal(saved.length,0);await c.executeAsync('明早');assert.equal(saved[0].remindAt,new Date(2026,8,16,8).getTime());
  const {ThreeStageCompanionProvider}=load('electron/three-stage-companion-provider.cjs');
  let clock=0;const events=[];const p=new ThreeStageCompanionProvider({now:()=>clock,onEvent:e=>events.push(e),asrFactory:()=>({}),modelFactory:()=>({}),ttsFactory:()=>({}),schedule:()=>({unref(){}}),cancelSchedule(){}});
  p.playbackTail={id:1,assistantText:'我正在讲故事',kind:'model'};
  p.handleAsrEvent({type:'speech.started',itemId:'human',audioStartMs:0});clock=250;
  p.handleAsrEvent({type:'partial',itemId:'human',text:'不是这样',confirmedText:'不是这样'});
  assert.equal(events.filter(e=>e.type==='barge.start').length,1);assert.equal(p.counters.bargeInsAcceptedPartial,1);
  console.log('T53 final-ASAR behavior passed: polite/relative/nearby time, retained correction, ordinary interruption before final.');
}
module.exports={load,verify};
if(require.main===module) verify().catch(error=>{console.error(error);process.exitCode=1;});
