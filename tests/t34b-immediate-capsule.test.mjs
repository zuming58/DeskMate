import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {initialVoiceSession,transitionVoiceSession} from '../src/domain/voiceSession.js';
const require=createRequire(import.meta.url);
const {isVoiceActivityActive}=require('../electron/voice-trigger-state.cjs');
const {createVoiceOverlayPresenter}=require('../electron/voice-overlay-presenter.cjs');
const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
function harness(){let resume,reject;const events=[];const context={Date,voiceStartPending:false,lastVoiceToggleAt:0,voiceSessionRecording:false,activeVoiceWorkflow:'input',voiceTargetCaptureToken:0,lastVoiceState:{state:'idle',floating:true},voiceTargetWindow:null,voiceEditContext:null,voiceTargetCapturePromise:null,shortcut:'test',
beginDictationForeground:()=>new Promise((yes,no)=>{resume=yes;reject=no;}),finishDictationForeground:()=>events.push('release'),getForegroundWindowId:()=>Promise.resolve('synthetic'),sendToMain:(name)=>events.push(name),updateVoiceState:value=>{context.lastVoiceState=value;events.push(value.state);}};
vm.createContext(context);vm.runInContext(main.slice(main.indexOf('async function emitVoiceToggle('),main.indexOf('async function emitVoiceCancel(')),context);
return {context,events,resume:()=>resume(),reject:()=>reject(Error('private error'))};}
test('T34B accepted start displays preparing before any audio coordination resolves',async()=>{
const h=harness(),pending=h.context.emitVoiceToggle();assert.deepEqual(h.events,['preparing']);assert.equal(h.context.voiceSessionRecording,false);
assert.equal((await h.context.emitVoiceToggle()).reason,'voice-starting');h.resume();await pending;assert(h.events.includes('voice-toggle'));
});
test('T34B cancellation while awaiting resource handover cannot start recording',async()=>{
const h=harness(),pending=h.context.emitVoiceToggle();h.context.voiceTargetCaptureToken++;h.resume();assert.equal((await pending).reason,'voice-start-cancelled');assert(!h.events.includes('voice-toggle'));assert(h.events.includes('release'));
});
test('T34B startup failure exits preparation without raw errors or stale start',async()=>{
const h=harness(),pending=h.context.emitVoiceToggle();h.reject();assert.equal((await pending).reason,'voice-start-failed');assert.deepEqual(h.events,['preparing','error']);assert.equal(h.context.voiceStartPending,false);
});
test('T34B preparing is active but not recording, permits cancel/failure/ready transitions',()=>{
const p=transitionVoiceSession(initialVoiceSession,'preparing');assert(isVoiceActivityActive(p));assert.equal(transitionVoiceSession(p,'recording').state,'recording');assert.equal(transitionVoiceSession(p,'idle').state,'idle');assert.equal(transitionVoiceSession(p,'error').state,'error');assert.throws(()=>transitionVoiceSession(p,'completed'));
});
test('T34B immediate overlay respects disabled setting and cancels old terminal timer',()=>{
let visible=false,shows=0,hidden=0,timer;const win={isDestroyed:()=>false,isVisible:()=>visible,hide:()=>{visible=false;hidden++;},webContents:{send:()=>{}}};
const present=createVoiceOverlayPresenter({getWindow:()=>win,show:()=>{visible=true;shows++;},schedule:fn=>{timer=fn;return 1;},cancel:()=>{}});
present({state:'completed'});present({state:'preparing'});timer();assert.equal(hidden,0);assert.equal(shows,1);present({state:'preparing',floating:false});assert.equal(hidden,1);
});
test('T34B late microphone permission after cancel releases tracks without starting recorder',async()=>{
let resolve,stopped=0,constructed=0;const source=fs.readFileSync(new URL('../src/hooks/useRecorder.js',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace(/^export \{.*\r?\n/gm,'').replaceAll('export function','function');
const c={useState:x=>[x,()=>{}],useRef:x=>({current:x}),useCallback:fn=>fn,useEffect:()=>{},window:{AudioContext:function(){},MediaRecorder:function(){constructed++;}},navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}},Date,setInterval,clearInterval,cancelAnimationFrame:()=>{}};
vm.createContext(c);vm.runInContext(source,c);const recorder=c.useRecorder();const pending=recorder.start();recorder.cancel();resolve({getTracks:()=>[{stop:()=>stopped++}]});assert.equal(await pending,false);assert.equal(stopped,1);assert.equal(constructed,0);
});
test('T34B renderer invalidates canceled starts and preserves T34A finish guard',()=>{
const s=fs.readFileSync(new URL('../src/pages.jsx',import.meta.url),'utf8');assert(s.includes("state:'preparing'"));assert(s.includes('recordingStartGenerationRef.current += 1'));assert(s.includes('if(startGeneration !== recordingStartGenerationRef.current)'));assert(s.includes('finalizedDictationOrFallback'));assert(main.includes('overlayWindow.showInactive()'));assert(main.includes('focusable: false'));
});
