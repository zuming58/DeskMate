// Final ASAR modules only, synthetic data and stub model; no real profile/network.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { load } = require('./verify-t53-natural-package.cjs');
const { CompanionMemoryStore } = load('electron/companion-memory.cjs');
const { MemoryCurationService } = load('electron/memory-curation.cjs');
async function verify() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-t71-package-'));
  const store = new CompanionMemoryStore({userDataPath:root});
  try {
    const text='我希望回答简洁一些，这是长期偏好。';
    const turn=store.appendTurn({sessionId:'fixture',role:'user',content:text});
    for (const summary of ['简洁回答','同样偏好简洁']) store.addCandidate({day:'2099-01-01',kind:'preference',summary,sourceTurnIds:[turn.id]});
    let calls=0;
    const service=new MemoryCurationService({store,loadSecret:()=>({}),policyStore:{snapshot:()=>({enabledSources:['companion']})},requestJson:async({messages})=>{
      calls++;const input=JSON.parse(messages.at(-1).content);
      return input.proposed ? {decisions:[{index:0,verdict:'supported',reason:'原话直接支持'}]} : {groups:[{ids:input.items.map(i=>i.id),action:'remember',kind:'preference',summary:'用户偏好简洁回答',reason:'明确原话',certainty:'explicit',evidence:[{turnId:turn.id,quote:text}]}]};
    }});
    await service.run();assert.equal(calls,0);
    store.setCurationEnabled({enabled:true,confirmed:true}); assert.equal((await service.run()).ok,true);
    assert.equal(calls,2); assert.equal(store.status().longTermMemories,1);
    assert.equal(store.curationStatus().processed,2); assert.equal(store.curationStatus().questions,0);
    assert.equal(store.list({filter:'archive'}).length,2);
    assert.equal(store.list({filter:'long-term'})[0].provenance.length,2);
    assert.equal(store.reviewedContextForQuery('简洁回答')[0].summary,'用户偏好简洁回答');
    await service.run();assert.equal(calls,2);
    console.log('T71 final-ASAR consent, archive preservation, verified curation, deduplication, provenance, retrieval and no-op cost checks passed.');
  } finally {store.close();fs.rmSync(root,{recursive:true,force:true});}
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
