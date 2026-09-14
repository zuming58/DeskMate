// A completed utterance is NOT completion of the user's whole recording.
// Only session.finished seals all final segments; failures use the full recording.
export function safeDictationFinalization(value = {}) {
  const reasons=['','missing-segment-id','missing-final-segment','missing-session-text','closed-before-finished','stream-error','finish-timeout','empty-finished','stream-not-ready','stream-not-configured','audio-queue-overflow','audio-append-rejected','finish-rejected','cancelled','superseded','microphone-start-failed'];
  const number = key => Number.isFinite(value[key]) ? Math.min(3600000,Math.max(0,Math.round(value[key]))) : 0;
  return {status:['complete','fallback','cancelled'].includes(value.status)?value.status:'unavailable',waitMs:number('waitMs'),segments:number('segments'),reason:reasons.includes(value.reason)?value.reason:'unknown'};
}
export function createDictationCompletion(attempt = 0) {
  let resolve;
  const value = { attempt, settled: false, complete: false, reason: '', items: new Map(), finalized: new Set(), language: '', emotion: '', promise: new Promise(done => { resolve = done; }) };
  value.fail = reason => { if(value.settled)return;value.reason=reason;value.settled=true;resolve(null); };
  value.accept = event => {
    if(value.settled)return;
    if(['speech-started','preview','completed'].includes(event.kind) && event.itemId && !value.items.has(event.itemId))value.items.set(event.itemId,'');
    if(event.kind==='completed') {
      if(!event.itemId){value.fail('missing-segment-id');return;}
      value.finalized.add(event.itemId);
      value.items.set(event.itemId,String(event.text || '').trim());value.language=String(event.language || '');value.emotion=String(event.emotion || '');
    } else if(event.kind==='finished') {
      if([...value.items.keys()].some(id=>!value.finalized.has(id))){value.fail('missing-final-segment');return;}
      const text=String(event.text || '').trim();
      if([...value.items.values()].some(Boolean) && !text){value.fail('missing-session-text');return;}
      value.complete=true;value.settled=true;
      resolve({text,language:value.language,emotion:value.emotion});
    } else if(event.kind==='error' || event.kind==='closed')value.fail(event.kind==='closed'?'closed-before-finished':'stream-error');
  };
  return value;
}

export async function finalizedDictationOrFallback({completion,blob,options={},fallback,timeoutMs=4000,now=Date.now}) {
  const started=now();let timer,abort;
  try {
    const result=await Promise.race([
      completion.promise,
      new Promise(resolve=>{timer=setTimeout(()=>{completion.fail('finish-timeout');resolve(null);},timeoutMs);}),
      new Promise(resolve=>{abort=()=>resolve(null);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)resolve(null);})
    ]);
    const finalization={status:completion.complete?'complete':'fallback',waitMs:Math.max(0,now()-started),segments:[...completion.items.values()].filter(Boolean).length,reason:completion.reason || ''};
    if(options.signal?.aborted)return {status:'cancelled',text:'',provider:'qwen3-asr-flash-realtime',durationMs:now()-started,finalization:{...finalization,status:'cancelled'}};
    if(completion.complete && result?.text.trim())return {status:'success',...result,provider:'qwen3-asr-flash-realtime',durationMs:now()-started,finalization};
    return {...await fallback.transcribe(blob,options),finalization:{...finalization,status:'fallback',reason:finalization.reason || 'empty-finished'}};
  } finally {clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
