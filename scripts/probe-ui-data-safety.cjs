// Opt-in isolated renderer smoke test. No native bridge, hardware or user profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const productRoot = process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname, '..');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-ui-probe-'));
app.setPath('userData', directory);
app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const watchdog = setTimeout(() => app.exit(2), 45000);
app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    win = new BrowserWindow({ show: false, width: 1440, height: 1024, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'probe-ui-preload.cjs') } });
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data|devtools):/.test(details.url) }));
    const errors = [];
    const downloads = [];
    win.webContents.session.on('will-download', (_event, item) => {
      const target = path.join(directory, path.basename(item.getFilename()));
      item.setSavePath(target);
      item.once('done', (_event, state) => { if (state === 'completed') downloads.push(target); });
    });
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && /ReferenceError|TypeError|Minified React error/.test(message)) errors.push(message); });
    const js = code => win.webContents.executeJavaScript(code);
    const click = async text => { assert.equal(await js(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`), true, text); await pause(150); };
    const route = async hash => { await js(`location.hash = ${JSON.stringify('#/' + hash)}`); await pause(300); };
    const input = async (selector, value) => {
      await js(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)}); field.dispatchEvent(new Event('input', {bubbles:true})); })()`);
      await pause(180);
    };
    const importFile = async (selector, value) => {
      await js(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(JSON.stringify(value))}], 'synthetic.json', {type:'application/json'})); const field = document.querySelector(${JSON.stringify(selector)}); field.files = transfer.files; field.dispatchEvent(new Event('change', {bubbles:true})); })()`);
      await pause(250);
    };
    await win.loadFile(path.join(productRoot, 'dist/client/index.html'), { hash: '/history' });
    await pause(300);
    assert.equal(await js(`document.querySelectorAll('.history-item').length`), 1);
    await click('清空');
    assert.equal(await js(`document.querySelector('[role="dialog"]') !== null`), true);
    await click('取消');
    assert.equal(await js(`document.querySelectorAll('.history-item').length`), 1);
    await click('导出'); await click('导出文字'); await pause(300);
    assert.equal(downloads.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(downloads[0], 'utf8')).records.length, 1);
    await route('settings'); await click('恢复默认'); await click('确认应用');
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.app-state')).history.length`), 1);
    await importFile('#config-import', { schemaVersion: 15, settings: { formatting: 'smart' }, history: [] });
    await click('确认应用');
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.app-state')).history.length`), 1);
    await route('vocabulary');
    await js(`window.probeRule = document.querySelector('.rule-row input'); probeRule.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(probeRule, 'changed'); probeRule.dispatchEvent(new Event('input',{bubbles:true}));`);
    await pause(150);
    assert.equal(await js(`document.querySelector('.rule-row input') === window.probeRule && document.activeElement === window.probeRule`), true, 'rule editor must not remount');
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.app-state')).vocabulary.rules[0].from`), 'changed');
    await importFile('input[type=file]', { schemaVersion: 1, hotwords: ['Probe', 'Imported'], rules: [{ from: 'source', to: 'target' }] });
    await click('合并导入');
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.app-state')).vocabulary.hotwords.length`), 2);
    await click('导出'); await pause(300);
    assert.equal(downloads.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(downloads[1], 'utf8')).rules.length, 2);
    await js(`window.savedStorageWrite = Storage.prototype.setItem; Storage.prototype.setItem = function() {throw new Error('synthetic quota failure')}; true;`);
    await input('.rule-row input', 'still-in-memory');
    assert.equal(await js(`document.querySelector('.storage-warning[role=alert]') !== null`), true);
    assert.equal(await js(`document.querySelector('.rule-row input').value`), 'still-in-memory');
    await js(`Storage.prototype.setItem = window.savedStorageWrite; true;`);
    await input('.rule-row input', 'recovered');
    assert.equal(await js(`document.querySelector('.storage-warning[role=alert]') === null`), true);
    await js(`window.desktopBridge = {
      getMemoryStatus: async () => ({ready:true, turns:0, sourceCounts:{}}), listMemories: async()=>[], getKnowledgeBaseStatus: async()=>({}), getMemoryJournalStatus: async()=>({active:{day:'2099-01-01'}}),
      getMemoryPolicy: async()=>({version:3,enabledSources:['companion'],schedule:'daily',dailyTime:'23:30',hourlyEnabled:true,audioRetentionDays:7,rawRetentionDays:20,lastResults:{}}),
      getKnowledgeOsStatus: async()=>({configured:false,credentialId:'',projectId:null,readEnabled:false,syncEnabled:false,sensitivity:'private'}),
      getLocalRetentionStatus: async()=>({ok:true,enabled:false,pending:0,lastRunAt:null,lastResult:null}),
      previewLocalRetention: async()=>({ok:true,token:'synthetic-preview',eligible:{recordings:2,historyText:3,memoryTurns:4},held:{'date-unknown':1}}),
      confirmLocalRetention: async()=>({ok:true,enabled:true,cleanup:{phase:'browser-pending',jobId:'synthetic-job',historyIds:[],audioIds:[]}}),
      runLocalRetentionNow: async()=>({ok:true,skipped:true,reason:'retention-already-ran-today'}),
      acknowledgeLocalRetention: async()=>({ok:true})
    }; true;`);
    await route('memory'); await pause(250);
    await js(`document.querySelector('.memory-advanced').open=true; window.confirm=()=>true; true;`);
    assert.equal(await js(`document.body.textContent.includes('录音 7 天 · 文字 20 天')`), true);
    await click('预览清理范围');
    assert.equal(await js(`document.body.textContent.includes('将清理 2 段录音、3 条历史文字和 4 条记忆原始回合')`), true);
    await click('确认本次并启用');
    await input('input[type=time]', '22:15');
    await input('.memory-management input[placeholder*="搜索"]', 'synthetic');
    await pause(350);
    assert.equal(await js(`document.querySelector('input[type=time]').value`), '22:15', 'query refresh must preserve unsaved policy');
    await js(`window.confirm=()=>false;true;`);await route('settings');
    assert(await js(`!!document.querySelector('.memory-management')`),'cancel navigation retains draft');
    await click('取消策略修改');assert.equal(await js(`document.querySelector('input[type=time]').value`),'23:30');
    await js(`window.confirm=()=>true;true;`);
    await route('settings'); await click('外观与悬浮窗');
    assert.equal(await js(`document.body.textContent.includes('背景不透明度')`), false);
    await click('AI 服务');
    await input('.service-config-block input[type=password]', 'synthetic-not-a-credential');
    await js(`window.confirm=()=>false;true;`);await route('history');
    assert(await js(`!!document.querySelector('.service-config-stack')`),'credential draft blocks navigation');
    await click('取消未保存修改');assert.equal(await js(`document.querySelector('.service-config-block input[type=password]').value`),'');
    await js(`window.confirm=()=>true;true;`);await route('companion');
    const originalOwner=await js(`document.querySelector('.companion-persona-form input').value`);
    await input('.companion-persona-form input','Synthetic owner');
    await js(`window.confirm=()=>false;true;`);await route('history');
    assert(await js(`!!document.querySelector('.companion-persona-form')`),'persona draft blocks navigation');
    await click('取消修改');assert.equal(await js(`document.querySelector('.companion-persona-form input').value`),originalOwner);
    await js(`window.confirm=()=>true;true;`);
    await route('sensors');
    assert.equal(await js(`document.querySelector('.breadcrumbs').textContent.includes('工作台')`), true, 'legacy sensor route falls back');
    await route('history'); await click('清空'); await click('永久删除');
    assert.equal(await js(`JSON.parse(localStorage.getItem('deskmate.app-state')).history.length`), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['confirmed-delete-cancel', 'real-history-export', 'reset-and-import-preserve-history', 'rule-edit-stable-focus-and-persistence', 'vocabulary-import-export', 'quota-failure-and-recovery', 'memory-refresh-preserves-draft', 'retention-preview-confirm', 'inert-controls-removed', 'legacy-route-blocked', 'confirmed-delete-success'], isolated: true }));
  } catch (error) { console.error(error.stack); exitCode = 1; }
  finally { clearTimeout(watchdog); win?.destroy(); app.exit(exitCode); }
});
