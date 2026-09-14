const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const productRoot=process.argv.includes('--packaged')?path.join(__dirname,'../release-t32b/win-unpacked/resources/app.asar'):path.join(__dirname,'..');
const {LocalHistoryStore}=require(path.join(productRoot,'electron/local-history-store.cjs'));
const {LocalHistoryService}=require(path.join(productRoot,'electron/local-history-service.cjs'));
const {LocalBackupService}=require(path.join(productRoot,'electron/local-backup-service.cjs'));
const {CompanionMemoryStore}=require(path.join(productRoot,'electron/companion-memory.cjs'));
const directory=fs.mkdtempSync(path.join(app.getPath('temp'),'deskmate-t32b-ui-'));
const profile=path.join(directory,'profile');fs.mkdirSync(profile);app.setPath('userData',profile);app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const watchdog=setTimeout(()=>app.exit(2),45000);
app.whenReady().then(async()=>{
  const store=new LocalHistoryStore({userDataPath:profile});store.finish({manifest:[],audioManifest:[]});
  store.putAudio({id:'audio',bytes:new Uint8Array([1,2,3]),createdAt:Date.parse('2026-09-01T00:00:00Z')});
  store.append({id:'synthetic',text:'Synthetic private history',rawText:'Synthetic source',time:'08:00',audioId:'audio'});store.close();
  new CompanionMemoryStore({userDataPath:profile}).close();
  const history=new LocalHistoryService({userDataPath:profile}),backup=new LocalBackupService({userDataPath:profile});
  const file=path.join(directory,'synthetic.deskmate-backup.json');let win,failedOnce=false,calls=0;
  try {
    ipcMain.handle('probe:history',(_event,{command,value})=>history.call(command,value));
    ipcMain.handle('probe:backup',async(_event,request)=>{
      calls++;await pause(250);
      if(request.command==='export' && !failedOnce){failedOnce=true;return {ok:false,reason:'backup-disk-full'};}
      return backup.call(request.command,{file,config:request.config,includeAudio:request.includeAudio});
    });
    win=new BrowserWindow({show:false,width:1440,height:1024,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false,offscreen:true,preload:path.join(__dirname,'probe-local-backup-preload.cjs')}});
    win.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));
    win.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:!/^(file|data|devtools):/.test(d.url)}));
    const js=code=>win.webContents.executeJavaScript(code);
    const until=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await pause(100);}throw new Error(`timeout: ${code}`);};
    const click=async text=>{assert(await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`));};
    await win.loadFile(path.join(productRoot,'dist/client/index.html'),{hash:'/settings'});
    await until(`document.body.textContent.includes('数据与备份')`);await click('数据与备份');
    await until(`document.querySelector('.local-backup-actions button')?.disabled===false`);
    assert.equal(await js(`document.querySelector('.local-backup-audio input').checked`),false);
    await click('创建本地备份');
    await until(`document.querySelector('.local-backup-actions button').disabled`);
    assert.equal(await js(`[...document.querySelectorAll('.local-backup-actions button')].every(b=>b.disabled)`),true);
    await until(`document.body.textContent.includes('磁盘空间不足')`);
    await click('创建本地备份');await until(`document.body.textContent.includes('备份已保存并校验')`);
    assert.equal(JSON.parse(fs.readFileSync(file)).data.audio.length,0);
    await click('校验备份并预览');await until(`document.querySelector('.local-backup-preview')!==null`);
    assert.equal(await js(`document.body.textContent.includes('未恢复或覆盖任何数据')`),true);
    assert.equal((await history.call('status')).records,1);
    assert.equal(fs.existsSync(path.join(profile,'recovery','job.json')),false);
    for(const [width,height] of [[1440,1024],[1024,768]]){
      win.setSize(width,height);await pause(150);
      await js(`document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();});true;`);await pause(350);
      const bounds=await js(`(()=>{const p=document.querySelector('.local-backup-panel').getBoundingClientRect();return {left:p.left,right:p.right,width:innerWidth};})()`);
      assert(bounds.left>=0 && bounds.right<=bounds.width+1);
      assert(await js(`document.documentElement.scrollWidth <= innerWidth+1`),'backup horizontal overflow');
      fs.writeFileSync(path.join(directory,`backup-${width}.png`),(await win.webContents.capturePage()).toPNG());
    }
    await js(`document.querySelector('.local-backup-audio input').click();true;`);
    await click('创建本地备份');await until(`document.body.textContent.includes('1 份录音')`);
    assert.equal(JSON.parse(fs.readFileSync(file)).data.audio.length,1);assert.equal(calls,4);
    await click('选择备份恢复');await until(`document.querySelector('.local-backup-message')?.textContent.includes('校验通过')`);
    assert(await js(`[...document.querySelectorAll('button')].some(b=>b.textContent==='恢复此备份并重启')`));
    assert.equal(fs.existsSync(path.join(profile,'recovery/job.json')),false);
    console.log('T32B real worker + isolated UI passed: default no audio, failure/retry, busy controls, export/readback, safe preview, 1440/1024 layout, opt-in audio. No live profile/hardware/cloud.');
    console.log(`Synthetic captures: ${directory}`);clearTimeout(watchdog);history.close();backup.close();win.destroy();app.exit(0);
  }catch(error){console.error(error.stack);clearTimeout(watchdog);history.close();backup.close();win?.destroy();app.exit(1);}
});
