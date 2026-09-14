const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const product=process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname,'..');
const {PromptWorkbenchStore}=require(path.join(product,'electron/prompt-workbench.cjs'));
const {PromptWorkbenchController}=require(path.join(product,'electron/prompt-workbench-controller.cjs'));
const directory=fs.mkdtempSync(path.join(app.getPath('temp'),'deskmate-t34-ui-'));app.setPath('userData',directory);app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let win;
const timer=setTimeout(()=>app.exit(2),45000);
app.whenReady().then(async()=>{try{
  const store=new PromptWorkbenchStore({userDataPath:directory});
  const controller=new PromptWorkbenchController({store,isForeground:()=>true,isSettingsForeground:()=>true,announce:()=>{},publish:value=>win?.webContents.send('probe:state',value)});
  ipcMain.handle('probe:prompts',(_e,value)=>controller.command(value));
  win=new BrowserWindow({show:false,width:1440,height:1024,webPreferences:{nodeIntegration:false,contextIsolation:true,offscreen:true,backgroundThrottling:false,preload:path.join(__dirname,'probe-scene-closure-preload.cjs')}});
  win.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));win.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:!/^(file|data|devtools):/.test(d.url)}));
  const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3 && /Error/.test(message))errors.push(message);});
  const js=code=>win.webContents.executeJavaScript(code);
  const click=async text=>{assert(await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`),text);await pause(240);};
  await win.loadFile(path.join(product,'dist/client/index.html'),{hash:'/keymap'});await pause(500);
  await js(`document.querySelector('[aria-label="管理场景"]').click();true;`);await pause(300);
  assert(await js(`!!document.querySelector('.scene-manager')`));
  await click('编辑');
  await js(`(()=>{const f=document.querySelector('.scene-manager-editor input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,'开发与写作');f.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(100);
  await click('保存场景');assert.equal(store.snapshot().scenes[0].title,'开发与写作');
  await click('归档');assert.equal(store.snapshot().scenes[0].archived,true);assert.equal(await js(`document.querySelectorAll('.keymap-scene').length`),2);
  await click('恢复');assert.equal(await js(`document.querySelectorAll('.keymap-scene').length`),3);
  for(const [width,height] of [[1440,1024],[1024,768]]){win.setSize(width,height);await pause(250);const bounds=await js(`(()=>{const b=document.querySelector('.scene-manager').getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth};})()`);assert(bounds.left>=0 && bounds.right<=bounds.width+1);fs.writeFileSync(path.join(directory,`scene-${width}.png`),(await win.webContents.capturePage()).toPNG());}
  await click('关闭');await js(`location.hash='/memory'`);await pause(500);
  assert.equal(await js(`document.querySelector('.memory-advanced').open`),false);
  assert(await js(`Boolean(document.querySelector('.memory-metrics').compareDocumentPosition(document.querySelector('.memory-advanced')) & Node.DOCUMENT_POSITION_FOLLOWING)`));
  for(const [width,height] of [[1440,1024],[1024,768]]){win.setSize(width,height);await pause(400);assert(await js(`document.documentElement.scrollWidth <= innerWidth+1`),'memory horizontal overflow');fs.writeFileSync(path.join(directory,`memory-${width}.png`),(await win.webContents.capturePage()).toPNG());}
  assert.deepEqual(errors,[]);console.log('T34 scene real store/UI and memory results-first checks passed. Captures: '+directory);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({ok:true,errors}));clearTimeout(timer);win.destroy();app.exit(0);
}catch(error){console.error(error.stack);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({ok:false,error:error.message}));clearTimeout(timer);win?.destroy();app.exit(1);}});
