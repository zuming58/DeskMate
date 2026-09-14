// Real renderer + real worker/SQLite, synthetic data only, all network/hardware denied.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const productRoot = process.argv.includes('--packaged') ? path.join(__dirname, '../release-t32/win-unpacked/resources/app.asar') : path.join(__dirname, '..');
const { LocalHistoryService } = require(path.join(productRoot, 'electron/local-history-service.cjs'));
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t32-ui-'));
app.setPath('userData', directory); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.exit(2), 45000);
app.whenReady().then(async () => {
  const service = new LocalHistoryService({userDataPath:directory});
  let failedOnce = false, win;
  try {
    ipcMain.handle('probe:history', (_event, {command, value}) => {
      if (command === 'stage' && !failedOnce) { failedOnce = true; throw new Error('synthetic-migration-interruption'); }
      return service.call(command, value);
    });
    win = new BrowserWindow({show:false, width:1440, height:1024, webPreferences:{nodeIntegration:false, contextIsolation:true, backgroundThrottling:false, offscreen:true, preload:path.join(__dirname,'probe-local-history-preload.cjs')}});
    win.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));
    win.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!/^(file|data|devtools):/.test(details.url)}));
    const js = code => win.webContents.executeJavaScript(code);
    const until = async code => { for(let i=0;i<80;i++){if(await js(code))return;await pause(100);}throw new Error(`condition-timeout: ${code}`); };
    await win.loadFile(path.join(productRoot,'dist/client/index.html'), {hash:'/history'});
    await until(`document.body.textContent.includes('历史保存需要处理')`);
    assert.equal((await service.call('status')).migrated, false);
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.history-migration-source.v1')).length`), 2);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='重试保存与迁移').click();true;`);
    await until(`document.body.textContent.includes('历史已接入本机独立数据库')`);
    assert.equal((await service.call('status')).records, 2);
    assert.equal((await service.call('status')).recordings, 2);
    assert.equal(await js(`document.querySelectorAll('.history-item').length`), 2);
    assert.equal(await js(`document.body.textContent.includes('日期未知')`), true);
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.app-state')).history.length`), 0);
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.history-migration-source.v1')).length`), 2);
    await js(`document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();});true;`);
    await pause(400);
    fs.writeFileSync(path.join(directory,'history-1440.png'), (await win.webContents.capturePage()).toPNG());
    await service.call('append',{id:'new',text:'Synthetic after migration',time:'12:30',createdAt:'2026-09-12T00:30:00Z'});
    win.reload();
    await until(`document.querySelectorAll('.history-item').length === 3`);
    assert.equal((await service.call('audio-get','probe-audio')).bytes.length,3);
    win.setSize(1024,768); await pause(250);
    assert.equal(await js(`document.querySelector('.history-list') !== null`), true);
    await js(`document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();});true;`);
    await pause(400);
    fs.writeFileSync(path.join(directory,'history-1024.png'), (await win.webContents.capturePage()).toPNG());
    await js(`localStorage.setItem('deskmate.app-state','{damaged'); location.hash='/vocabulary'; true;`); await pause(300);
    await js(`(()=>{const field=document.querySelector('.rule-row input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'synthetic');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until(`document.body.textContent.includes('旧配置损坏，已停止覆盖')`);
    assert.equal(await js(`localStorage.getItem('deskmate.app-state')`), '{damaged');
    console.log('T32 isolated UI passed: interrupted migration/retry, audio + orphan integrity, persistent reload, unknown date, small-window presence, corrupt-source protection. No real profile/hardware/cloud.');
    console.log(`Synthetic UI captures: ${directory}`);
    clearTimeout(watchdog); service.close(); win.destroy(); app.exit(0);
  } catch(error) { console.error(error.stack);clearTimeout(watchdog);service.close();win?.destroy();app.exit(1); }
});
