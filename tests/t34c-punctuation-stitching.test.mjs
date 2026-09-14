import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const {appendRecognizedSegment,stitchRecognizedSegments}=require('../electron/dictation-text.cjs');
const {BailianRealtimeSession}=require('../electron/bailian-realtime.cjs');

test('T34C adds a comma only when neither segment boundary supplies punctuation',()=>{
 assert.equal(stitchRecognizedSegments(['正常的','对']),'正常的，对');
 assert.equal(stitchRecognizedSegments(['你好。','刚才']),'你好。刚才');
 assert.equal(stitchRecognizedSegments(['然后，','刚才']),'然后，刚才');
 assert.equal(stitchRecognizedSegments(['hello,','world']),'hello,world');
});

test('T34C collapses conflicting punctuation only at the segment boundary',()=>{
 assert.equal(stitchRecognizedSegments(['然后。','，刚才']),'然后。刚才');
 assert.equal(stitchRecognizedSegments(['然后，','。刚才']),'然后。刚才');
 assert.equal(stitchRecognizedSegments(['真的？','，是的']),'真的？是的');
 assert.equal(stitchRecognizedSegments(['可以，','！开始']),'可以！开始');
});

test('T34C ignores empty segments and preserves raw interior wording',()=>{
 assert.equal(stitchRecognizedSegments(['  嗯，我我觉得。  ','','  然后。目标。  ']),'嗯，我我觉得。然后。目标。');
 assert.equal(appendRecognizedSegment('嗯。 ，内部符号不改','下一段'),'嗯。 ，内部符号不改，下一段');
});

test('T34C realtime preview and finished event share the same stitched text',async()=>{
 class FakeSocket extends EventEmitter {
  static OPEN=1;
  constructor(){super();this.readyState=FakeSocket.OPEN;FakeSocket.instance=this;queueMicrotask(()=>this.emit('open'));}
  send(payload){if(JSON.parse(payload).type==='session.update')queueMicrotask(()=>this.emit('message',JSON.stringify({type:'session.updated'})));}
  close(){this.readyState=3;this.emit('close');}
 }
 const events=[];
 const session=new BailianRealtimeSession({apiKey:'sk-12345678',WebSocketImpl:FakeSocket,onEvent:event=>events.push(event)});
 await session.start();
 const emit=value=>FakeSocket.instance.emit('message',JSON.stringify(value));
 emit({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'然后。'});
 emit({type:'conversation.item.input_audio_transcription.text',item_id:'b',text:'，刚才',stash:''});
 assert.equal(events.at(-1).preview,'然后。刚才');
 emit({type:'conversation.item.input_audio_transcription.completed',item_id:'b',transcript:'，刚才'});
 emit({type:'session.finished'});
 const finished=events.findLast(event=>event.kind==='finished');
 assert.equal(finished.text,'然后。刚才');
});
