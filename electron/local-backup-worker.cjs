const {parentPort,workerData} = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {buildBundle,prepareRestore,queueRestore,boundedRead,sha,json,writeAtomic,readJson} = require('./local-backup.cjs');

function exportBackup({file,config,includeAudio}) {
  if(typeof file!=='string' || !path.isAbsolute(file) || !file.endsWith('.deskmate-backup.json') || typeof includeAudio!=='boolean')throw new Error('backup-request-invalid');
  const relative=path.relative(fs.realpathSync(workerData.userDataPath),path.join(fs.realpathSync(path.dirname(file)),path.basename(file)));
  if(!relative.startsWith('..'+path.sep) && !path.isAbsolute(relative))throw new Error('backup-target-is-internal');
  if(fs.existsSync(file) && !fs.lstatSync(file).isFile())throw new Error('backup-target-invalid');
  const bundle=buildBundle(workerData.userDataPath,config,includeAudio);
  inspectBundle(bundle);
  const bytes=Buffer.from(json(bundle));
  const temporary=`${file}.${randomUUID()}.partial`;
  try {
    const fd=fs.openSync(temporary,'wx');
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(sha(boundedRead(temporary))!==sha(bytes))throw new Error('backup-export-integrity');
    fs.renameSync(temporary,file);
    return {ok:true,bytes:bytes.length,history:bundle.data.history.history.length,recordings:bundle.data.audio.length,createdAt:bundle.createdAt};
  } finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function inspectBackup({file}) {
  if(typeof file!=='string' || !path.isAbsolute(file))throw new Error('backup-request-invalid');
  const bundle=JSON.parse(boundedRead(file));
  return inspectBundle(bundle);
}
function inspectBundle(bundle) {
  // Inspect in an isolated directory, not the live profile. No offline job is queued.
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'deskmate-backup-inspect-'));
  try {return {ok:true,summary:prepareRestore(temp,bundle).summary,restoreAvailable:false};}
  finally {
    const parent=fs.realpathSync(os.tmpdir()),resolved=fs.realpathSync(temp);
    if(path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('deskmate-backup-inspect-'))throw new Error('backup-temp-scope-invalid');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
parentPort.on('message',({command,value})=>{
  try {
    let result;
    if(command==='checkpoint') {
      const file=path.join(workerData.userDataPath,'recovery','verified-latest.json');
      const bundle=buildBundle(workerData.userDataPath,value.config,false);inspectBundle(bundle);
      fs.mkdirSync(path.dirname(file),{recursive:true});writeAtomic(file,json(bundle));result={ok:true,createdAt:bundle.createdAt};
    } else if(command==='prepare'||command==='prepare-checkpoint') {
      const file=command==='prepare-checkpoint'?path.join(workerData.userDataPath,'recovery','verified-latest.json'):value.file;
      result=prepareRestore(workerData.userDataPath, JSON.parse(boundedRead(file)));
      writeAtomic(path.join(workerData.userDataPath,'recovery',`token-${result.id}.json`),json({expiresAt:result.expiresAt}));
      result={ok:true,...result,token:result.id};
    } else if(command==='queue') {
      if(!/^[a-f0-9-]{36}$/.test(value.token || ''))throw new Error('backup-token-invalid');
      const token=readJson(path.join(workerData.userDataPath,'recovery',`token-${value.token}.json`),null);
      if(!token || token.expiresAt<Date.now())throw new Error('backup-token-expired');
      result=queueRestore(workerData.userDataPath,value.token);
    } else result=command==='export' ? exportBackup(value) : command==='inspect' ? inspectBackup(value) : (()=>{throw new Error('backup-command-invalid');})();
    parentPort.postMessage({result});
  } catch(error) {
    const message=error?.code==='ENOSPC' ? 'backup-disk-full' : /^backup-[a-z-]+$/.test(error?.message) ? error.message : 'backup-data-or-storage-invalid';
    parentPort.postMessage({error:message});
  }
});
