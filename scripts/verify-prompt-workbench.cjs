// Isolated Electron visual/interaction QA: production page + production store/controller.
// Native input, clipboard and speech are intentionally replaced with test sinks.
// No device writes, credentials, microphone capture or user's library are used.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PromptWorkbenchStore } = require('../electron/prompt-workbench.cjs');
const { PromptWorkbenchController } = require('../electron/prompt-workbench-controller.cjs');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-prompt-qa-'));
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window; const calls = []; const assertions = []; const errors = [];
const record = (name, condition) => { assert(condition, name); assertions.push(name); };
const store = new PromptWorkbenchStore({ userDataPath: path.join(output, 'store') });
const controller = new PromptWorkbenchController({ store, isForeground: () => window.isFocused(),
  show: () => { window.show(); window.focus(); }, hide: () => { calls.push('hide'); window.hide(); },
  capture: async () => calls.push('capture'), restore: async () => { calls.push('restore'); return { ok: true }; },
  input: async value => { calls.push(['input', value]); return { ok: true }; }, writeClipboard: async value => calls.push(['copy', value]),
  announce: async value => calls.push(['say', value]), publish: value => window.webContents.send('prompt-workbench-state', value) });
app.whenReady().then(async () => {
  // Benign stubs only for unrelated background app capabilities. No real services start.
  const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');
  const channels = [...new Set([...preload.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m => m[1]))];
  channels.forEach(channel => ipcMain.handle(channel, (_e, value) => {
    if (channel === 'prompts:command') return controller.command(value).catch(e => ({ ok: false, reason: e.message }));
    if (channel === 'desktop:get-capabilities') return { supported: true, platform: 'win32', inputBridge: { available: false, boardConnected: false } };
    if (channel === 'desktop:register-shortcut') return { registered: false, shortcut: 'Ctrl+Shift+Space' };
    if (channel === 'desktop:preview-keyboard-config-patch') return { ok: false, reason: 'qa-no-hardware' };
    return { ok: false, reason: 'isolated-ui-qa' };
  }));
  window = new BrowserWindow({ width: 1440, height: 1024, useContentSize: true, show: true,
    webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  window.setMenu(null);
  window.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && !/No handler registered|isolated-ui-qa/.test(message)) errors.push(message.slice(0, 200)); });
  await window.loadFile(path.join(root, 'dist/client/index.html'), { hash: '/prompts' }); await pause(1200); window.focus();
  const run = code => window.webContents.executeJavaScript(code);
  const clickText = async text => { await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`); await pause(150); };
  const shot = async name => { const png = await window.webContents.capturePage(); fs.writeFileSync(path.join(output, name + '.png'), png.toPNG()); };
  const press = async (key, modifiers = []) => { window.show(); window.focus(); await pause(80); window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers }); await pause(180); };
  record('80 builtin prompts', controller.snapshot().builtinCount === 80);
  record('main DeskMate nav contains prompts', await run(`document.querySelector('.sidebar__nav').textContent.includes('提示词')`));
  record('16 coding prompts rendered', await run(`document.querySelectorAll('.prompt-row').length===16`));
  await shot('prompts-1440');
  record('no horizontal overflow 1440', await run(`document.documentElement.scrollWidth<=window.innerWidth`));
  await run(`document.querySelector('.prompt-workbench').focus()`); await press('Tab');
  record('Tab changes to video scene and Space mapping', store.data.activeScene === 'scene-video' && store.data.scenes[1].bindings[5].value === 'Space');
  await shot('prompts-video-1440');
  await press('Tab', ['shift']); record('Shift Tab returns coding', store.data.activeScene === 'coding');
  const old = controller.snapshot().selectedId;
  await run(`document.querySelector('.prompt-rows').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}))`); await pause(180);
  record('wheel selects next prompt', controller.snapshot().selectedId !== old);
  record('prompt page has no keyboard configuration controls', await run(`!document.querySelector('.prompt-key-grid') && !document.querySelector('.scene-key-settings')`));
  record('no outer vertical scroll 1440', await run(`document.documentElement.scrollHeight<=window.innerHeight && document.querySelector('.app-shell').getBoundingClientRect().height<=window.innerHeight`));
  record('preview has at least the list width', await run(`document.querySelector('.prompt-context').getBoundingClientRect().width>=document.querySelector('.prompt-library').getBoundingClientRect().width`));
  await controller.command({ type:'view', selectedId: controller.snapshot().rows.at(-1).id }); await pause(180);
  record('last prompt scrolls list only', await run(`document.querySelector('.prompt-rows').scrollTop>0 && window.scrollY===0`));
  await shot('prompts-scrolled-1440');
  await clickText('新建提示词');
  record('editor opens', await run(`!!document.querySelector('[role=dialog]')`));
  const sceneBefore = store.data.activeScene; await press('Tab'); record('Tab in editor does not change scene', store.data.activeScene === sceneBefore);
  await shot('prompt-editor-1440'); await press('Escape');
  record('Escape closes editor only', window.isVisible() && await run(`!document.querySelector('[role=dialog]')`));
  await clickText('新建提示词');
  await run(`document.querySelector('.prompt-modal input').focus()`); window.webContents.insertText('QA 本地提示词'); await pause(80);
  await run(`document.querySelector('.prompt-modal textarea').focus()`); window.webContents.insertText('仅用于本地 UI 测试，不执行任何操作。'); await pause(80);
  await clickText('保存提示词');
  record('editor saves title/body through real main-owned store', store.data.personal.length === 1 && store.data.personal[0].title === 'QA 本地提示词');
  await clickText('我的'); record('mine filter shows saved prompt', await run(`document.querySelectorAll('.prompt-row').length===1`));
  await run(`document.querySelector('[aria-label="收藏 QA 本地提示词"]').click()`); await pause(120);
  record('favorite button persists', store.data.favorites.includes(store.data.personal[0].id));
  await run(`document.querySelector('[aria-label="删除 QA 本地提示词"]').click()`); await pause(120);
  record('delete moves personal prompt to trash', store.data.personal[0].deleted);
  await clickText('回收站'); await run(`document.querySelector('[aria-label="恢复 QA 本地提示词"]').click()`); await pause(120);
  record('restore returns personal prompt', !store.data.personal[0].deleted);
  await clickText('我的'); await run(`document.querySelector('[aria-label="删除 QA 本地提示词"]').click()`); await pause(120); await clickText('全部');
  await press('Escape'); record('ordinary browse Escape keeps main window', window.isVisible());
  await run(`document.querySelector('[aria-label="搜索提示词"]').focus()`);
  window.webContents.insertText('重启'); await pause(200); record('search returns expected result', controller.snapshot().rows[0]?.id === 'CODING-002');
  await controller.command({ type: 'view', query: '' });
  await clickText('浏览全部 80 条'); record('browse all includes other 38 prompts', await run(`document.querySelectorAll('.prompt-row').length===80`));
  await clickText('回到当前场景');
  await run(`document.querySelector('[aria-label="新增场景"]').click()`); await pause(200); await shot('prompt-scene-editor');
  record('prompt scene editor has no key binding controls', await run(`document.querySelectorAll('.prompt-binding').length===0`)); await press('Escape');
  await run(`Array.from(document.querySelectorAll('.sidebar__nav button')).find(b=>b.textContent.trim()==='按键配置').click()`); await pause(400);
  record('key configuration owns three scene bindings', await run(`document.querySelectorAll('.scene-key-settings .prompt-binding').length===3`));
  record('key configuration describes KEY3 companion and KEY4 prompts', await run(`document.querySelector('.scene-key-contract').textContent.includes('KEY 3 · 语音助手') && document.querySelector('.scene-key-contract').textContent.includes('KEY 4 · 提示词')`));
  await run(`(() => { const select=document.querySelector('[aria-label="配置场景"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'scene-video'); select.dispatchEvent(new Event('change',{bubbles:true})); })()`); await pause(120);
  await run(`document.querySelector('.scene-key-bindings fieldset input[maxlength="64"]').focus()`); await press('a',['control']); window.webContents.insertText('Ctrl+S'); await pause(120);
  await clickText('保存场景按键');
  record('scene key editor saves real local binding', store.data.scenes.find(s=>s.id==='scene-video').bindings[5].value==='Ctrl+S');
  record('editing other scene keeps active scene unchanged', store.data.activeScene==='coding');
  await shot('prompt-keys-1440');
  await run(`Array.from(document.querySelectorAll('.sidebar__nav button')).find(b=>b.textContent.trim()==='提示词').click()`); await pause(300);
  window.setContentSize(960, 680); await pause(250); await run('window.scrollTo(0,0)'); await shot('prompts-960');
  record('no horizontal overflow 960', await run(`document.documentElement.scrollWidth<=window.innerWidth`));
  record('no outer vertical scroll 960', await run(`document.documentElement.scrollHeight<=window.innerHeight`));
  record('prompt list and preview remain usable at 960', await run(`document.querySelector('.prompt-rows').clientHeight>=160 && document.querySelector('.prompt-preview-body').clientHeight>=160`));
  await run(`document.querySelector('[aria-label="搜索提示词"]').focus()`);
  window.hide(); await controller.key(4); await pause(200);
  record('KEY4 re-entry leaves search focus and restores hardware selection mode', await run(`document.activeElement.classList.contains('prompt-workbench')`));
  await press('Escape'); record('transient Escape hides main window without copying', !window.isVisible() && !calls.some(c => Array.isArray(c) && c[0] === 'copy'));
  await controller.key(4); await pause(180); const selected = controller.snapshot().selectedId;
  await controller.key(4); record('second KEY4 copies exact body and hides main window', !window.isVisible() && calls.some(c => Array.isArray(c) && c[0] === 'copy' && c[1] === store.get(selected).body));
  const report = { result: 'passed', assertions, errors, output, nativeInput: 'test sink; physical board not tested', clipboard: 'test sink; system clipboard unchanged' };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); app.quit();
}).catch(async error => { if (window) { fs.writeFileSync(path.join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG()); } const report = { result: 'failed', reason: error.message, assertions, errors, output }; fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.error(JSON.stringify(report)); app.exit(1); });
