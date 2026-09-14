const {Worker} = require('node:worker_threads');
const path = require('node:path');
class LocalBackupService {
  constructor({userDataPath}) {this.root=userDataPath;this.pending=null;this.closed=false;}
  call(command,value) {
    if(this.closed)return Promise.reject(new Error('backup-service-closed'));
    if(this.pending)return Promise.reject(new Error('backup-busy'));
    if(!['export','inspect','prepare','queue','checkpoint','prepare-checkpoint'].includes(command))return Promise.reject(new Error('backup-command-invalid'));
    return new Promise((resolve,reject)=>{
      const worker=new Worker(path.join(__dirname,'local-backup-worker.cjs'),{workerData:{userDataPath:this.root}});
      const finish=(error,result)=>{if(this.pending?.worker!==worker)return;this.pending=null;void worker.terminate();error?reject(new Error(error)):resolve(result);};
      this.pending={worker,reject};
      worker.once('message',({error,result})=>finish(error,result));
      worker.once('error',()=>finish('backup-worker-unavailable'));
      worker.once('exit',()=>finish('backup-worker-unavailable'));
      try{worker.postMessage({command,value});}catch{finish('backup-request-invalid');}
    });
  }
  close(){this.closed=true;const pending=this.pending;this.pending=null;if(pending){pending.reject(new Error('backup-service-closed'));void pending.worker.terminate();}}
}
module.exports={LocalBackupService};
