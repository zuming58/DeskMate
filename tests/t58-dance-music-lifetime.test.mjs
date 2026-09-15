import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createLocalDanceMusicEngine} from '../src/domain/localDanceMusic.js';

function media(load=async()=>({ok:true,data:new Uint8Array([1,2]),mimeType:'audio/mpeg'})) {
  const audios=[],events=[],revoked=[];
  const engine=createLocalDanceMusicEngine({bridge:{loadDanceMusic:load,sendDanceMusicPlaybackEvent:e=>events.push(e)},
    audioFactory:()=>{const a={pauseCalls:0,playCalls:0,pause(){this.pauseCalls++;},async play(){this.playCalls++;}};audios.push(a);return a;},
    createObjectURL:()=>`blob:test-${audios.length}`,revokeObjectURL:url=>revoked.push(url)});
  return {engine,audios,events,revoked};
}
function host(execute) {
  const source=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
  const commands=[];
  const context=vm.createContext({Date,activeDanceMusicRequestId:'',danceMusicSequence:0,
    localDanceMusicStore:{status:()=>({configured:false}),notePlayback(){}},
    sendToMain:(channel,value)=>{if(channel==='dance-music-command')commands.push(value);},xiaozhiHardwareEnabled:()=>true,
    choreographyService:{executePreset:execute,execute, noteLegacyFallback:(_,result)=>result},
    motionPresetService:{runPreset:execute}});
  // Evaluate only these production functions, never Electron main or hardware.
  vm.runInContext(source.slice(source.indexOf('function emitDanceMusicStatus()'),source.indexOf('function createAudioSetupWindow()')),context);
  return {context,commands};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('T58 built-in and selected dance tracks loop until an explicit owned stop',async()=>{
  for(const type of ['synthesize','play']) {
    const {engine,audios,events,revoked}=media();
    await engine.handleCommand({type,preset:'dance',loop:true,requestId:'dance'});
    assert.equal(audios[0].loop,true);
    // Even a spurious natural-end callback cannot release a motion-owned loop.
    audios[0].onended();assert.equal(events.at(-1).state,'playing');assert.equal(revoked.length,0);
    await engine.handleCommand({type:'stop',requestId:'dance'});
    assert.equal(audios[0].pauseCalls,1);assert.equal(audios[0].loop,false);assert.equal(revoked.length,1);
  }
});
test('T58 previews and non-dance cues remain one-shot',async()=>{
  for(const command of [{preset:'dance'}, {preset:'nod',loop:true}]) {
    const {engine,audios,events}=media();await engine.handleCommand({type:'synthesize',requestId:'cue',...command});
    assert.equal(audios[0].loop,false);audios[0].onended();assert.equal(events.at(-1).state,'idle');
  }
});
test('T58 stale stop or ended callback cannot stop newer playback',async()=>{
  const {engine,audios,events}=media();await engine.handleCommand({type:'play',preset:'dance',loop:true,requestId:'old'});
  const oldEnd=audios[0].onended;await engine.handleCommand({type:'play',preset:'dance',loop:true,requestId:'new'});
  const count=events.length;oldEnd();assert.equal(events.length,count);
  assert.equal((await engine.handleCommand({type:'stop',requestId:'old'})).skipped,true);assert.equal(audios[1].pauseCalls,0);
  await engine.handleCommand({type:'stop',requestId:''});assert.equal(audios[1].pauseCalls,1);
});
test('T58 a stopped pending load cannot start later',async()=>{
  const pending=deferred();const {engine,audios}=media(()=>pending.promise);
  const result=engine.handleCommand({type:'play',preset:'dance',loop:true,requestId:'loading'});
  await engine.handleCommand({type:'stop',requestId:'loading'});pending.resolve({ok:true,data:[1]});
  assert.equal((await result).reason,'dance-music-command-superseded');assert.equal(audios.length,0);
});
test('T58 failed load is handled; teardown stops a loop and revokes its resource',async()=>{
  const failed=media(async()=>{throw Error('load');});assert.equal((await failed.engine.handleCommand({type:'play',requestId:'failed'})).ok,false);
  assert.equal(failed.events.at(-1).state,'error');
  const {engine,audios,revoked}=media();await engine.handleCommand({type:'synthesize',preset:'dance',loop:true,requestId:'loop'});
  engine.close();assert.equal(audios[0].pauseCalls,1);assert.equal(revoked.length,1);assert.equal(audios[0].onended,null);
});
test('T58 media decoding failure releases a looping track without restarting it',async()=>{
  const {engine,audios,events}=media();await engine.handleCommand({type:'play',preset:'dance',loop:true,requestId:'dance'});
  audios[0].onerror();assert.equal(events.at(-1).state,'error');assert.equal(audios[0].pauseCalls,1);assert.equal(audios[0].playCalls,1);
});
test('T58 preset and custom dance wait for motion completion, not clip duration',async()=>{
  for(const method of ['runMotionPreset','runCustomChoreography']) {
    const pending=deferred();const {context,commands}=host(()=>pending.promise);
    const operation=context[method]({preset:'dance',repeat:3,source:'UI'});
    assert.equal(commands[0].loop,true);assert.equal(commands.filter(c=>c.type==='stop').length,0);
    pending.resolve({ok:true,endpointReportedComplete:true});await operation;
    assert.equal(commands.at(-1).type,'stop');assert.equal(commands.at(-1).requestId,commands[0].requestId);
  }
});
test('T58 motion error and thrown failure stop the owned loop',async()=>{
  for(const throwing of [false,true]) {
    const {context,commands}=host(async()=>{if(throwing)throw Error('failure');return {ok:false,reason:'emergency-stopped'};});
    await context.runMotionPreset({preset:'dance',source:'UI'}).catch(()=>{});
    assert.equal(commands.at(-1).type,'stop');
  }
});
test('T58 legacy fallback retains audio until fallback completion',async()=>{
  const pending=deferred();const {context,commands}=host(async()=>({ok:false,reason:'choreography-interface-unavailable'}));
  context.motionPresetService.runPreset=()=>pending.promise;
  const operation=context.runMotionPreset({preset:'dance',source:'UI'});await Promise.resolve();
  assert.equal(commands.length,1);pending.resolve({ok:true});await operation;assert.equal(commands.at(-1).type,'stop');
});
test('T58 old motion completion cannot stop a newer preview',async()=>{
  const pending=deferred();const {context,commands}=host(()=>pending.promise);
  const operation=context.runMotionPreset({preset:'dance',source:'UI'});
  context.startDanceMusic({force:true});assert.equal(commands[1].loop,false);
  pending.resolve({ok:true});await operation;assert.equal(commands.length,2);
  context.stopDanceMusic('emergency-stop');assert.equal(commands.at(-1).type,'stop');
});
test('T58 short preset cues do not loop even when owned by a motion',async()=>{
  const {context,commands}=host(async()=>({ok:true}));await context.runMotionPreset({preset:'nod',source:'UI'});
  assert.equal(commands[0].loop,false);
});
