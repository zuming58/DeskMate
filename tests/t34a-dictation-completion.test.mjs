import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createDictationCompletion,finalizedDictationOrFallback,safeDictationFinalization} from '../src/domain/dictationStreamCompletion.js';
const require=createRequire(import.meta.url);
const {stitchRecognizedSegments}=require('../electron/dictation-text.cjs');
const completed=(c,id,text)=>c.accept({kind:'completed',itemId:id,text});
const finished=c=>c.accept({kind:'finished',text:stitchRecognizedSegments(c.items.values())});
function request(c,extra={}) {return finalizedDictationOrFallback({completion:c,blob:'full-audio',fallback:{transcribe:async blob=>({status:'success',text:blob})},...extra});}
test('T34A early utterance does not seal whole dictation; delayed tail is retained',async()=>{
 const c=createDictationCompletion();completed(c,'a','第一句');let done=false;const p=request(c).then(r=>{done=true;return r;});
 await Promise.resolve();assert.equal(done,false);completed(c,'b','最后一句');finished(c);
 const r=await p;assert.equal(r.text,'第一句，最后一句');assert.equal(r.finalization.segments,2);assert.equal(r.finalization.status,'complete');
});
test('T34A first-seen segment order, replacement and provisional text isolation',async()=>{
 const c=createDictationCompletion();c.accept({kind:'preview',itemId:'a',text:'临时错误'});c.accept({kind:'speech-started',itemId:'b'});
 completed(c,'b','第二句');completed(c,'a','第一句');completed(c,'a','第一句修正');finished(c);c.accept({kind:'closed'});
 assert.equal((await request(c)).text,'第一句修正，第二句');
});
test('T34A finished with unconfirmed last segment falls back to entire recording',async()=>{
 const c=createDictationCompletion();completed(c,'a','前半段');c.accept({kind:'preview',itemId:'b',text:'未确认'});finished(c);
 const r=await request(c);assert.equal(r.text,'full-audio');assert.equal(r.finalization.reason,'missing-final-segment');
});
for(const kind of ['closed','error'])test(`T34A ${kind} never outputs confirmed prefix`,async()=>{
 const c=createDictationCompletion();completed(c,'a','前半段');c.accept({kind});const r=await request(c);assert.equal(r.text,'full-audio');assert.equal(r.finalization.status,'fallback');
});
test('T34A finish deadline reprocesses full audio instead of accepting prefix',async()=>{
 const c=createDictationCompletion();completed(c,'a','前半段');const r=await request(c,{timeoutMs:5});assert.equal(r.text,'full-audio');assert.equal(r.finalization.reason,'finish-timeout');
});
test('T34C missing main-process stitched text falls back to the entire recording',async()=>{
 const c=createDictationCompletion();completed(c,'a','前半段');c.accept({kind:'finished'});
 const r=await request(c);assert.equal(r.text,'full-audio');assert.equal(r.finalization.reason,'missing-session-text');
});
test('T34A cancellation never starts fallback',async()=>{
 const c=createDictationCompletion(),a=new AbortController();const p=request(c,{options:{signal:a.signal},fallback:{transcribe:()=>assert.fail('must not transcribe')}});a.abort();assert.equal((await p).status,'cancelled');
});
test('T34A rejected audio or missing ID cannot become successful partial stream',async()=>{
 for(const reason of ['audio-append-rejected','audio-queue-overflow','finish-rejected']){const c=createDictationCompletion();completed(c,'a','prefix');c.fail(reason);finished(c);assert.equal((await request(c)).text,'full-audio');}
 const c=createDictationCompletion();completed(c,'','text');assert.equal((await request(c)).finalization.reason,'missing-segment-id');
});
test('T34A metrics exclude content and arbitrary identifiers',()=>{
 const result=safeDictationFinalization({status:'complete',waitMs:1.8,segments:2,reason:'secret',text:'private',itemId:'private'});
 assert.deepEqual(result,{status:'complete',waitMs:2,segments:2,reason:'unknown'});
});
test('T34A renderer finishes after capture completion and pending appends, not on first segment',()=>{
 const source=fs.readFileSync(new URL('../src/pages.jsx',import.meta.url),'utf8');
 assert(source.includes('Promise.all([...realtimeAppendsRef.current])'));assert(!source.includes('realtimeFinalRef'));assert(source.includes('beginRealtimePreview(); return { ok: await computerRecorder.start()'));
 const stop=source.slice(source.indexOf('const lockedSource = lockedMicrophoneSourceRef.current;'),source.indexOf('cancelRef.current = () =>'));
 assert(!stop.includes('finishBailianRealtime'));assert(source.includes('finalization: processed.transcript.finalization'));
});
