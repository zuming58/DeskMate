// Native Electron QA with a temporary profile and synthetic data only.
// Uses the real React build/preload and main-owned overview projection. Never
// starts the production main, touches devices, captures audio or contacts APIs.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { PromptWorkbenchStore } = require('../electron/prompt-workbench.cjs');
const { PromptWorkbenchController } = require('../electron/prompt-workbench-controller.cjs');
const { createWorkbenchOverview } = require('../electron/workbench-overview.cjs');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-workbench-qa-'));
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assertions = []; const errors = []; const calls = [];
let window; let failOverview = false; let empty = false;
const promptStore = new PromptWorkbenchStore({ userDataPath: output });
const controller = new PromptWorkbenchController({ store: promptStore });
const now = Date.now();
const dayAt = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const activity = Array.from({ length: 7 }, (_, index) => ({ day: dayAt(now - (6-index)*86400000), dictationCount: [4,8,6,12,3,10,8][index], companionCount: [2,5,4,8,5,7,6][index], dictationCharacters: 286 }));
const memory = () => ({ ready: true, activity: empty ? activity.map(d => ({ ...d, dictationCount: 0, companionCount: 0, dictationCharacters: 0 })) : activity,
  today: empty ? { dictationCount: 0, companionCount: 0, dictationCharacters: 0 } : activity.at(-1),
  firstCompanionDay: empty ? null : dayAt(now-10*86400000), companionDays: empty ? 0 : 11,
  longTermMemories: empty ? 0 : 12, pendingCandidates: empty ? 0 : 3, completedJournals: empty ? 0 : 7,
  pendingSync: empty ? 0 : 2, acceptedSync: empty ? 0 : 12, lastHourlyAt: empty ? null : now-3600000,
  latestJournal: empty ? null : { day: dayAt(now-86400000), status: 'completed' }, lastAcceptedAt: empty ? null : now-86400000 });
const overview = () => createWorkbenchOverview({ memoryStore: { dashboardSummary: memory }, promptStore,
  policyStore: { snapshot: () => ({ enabledSources: empty ? [] : ['companion','dictation'], hourlyEnabled: !empty, schedule: 'daily', dailyTime: '23:30', rawRetentionDays: 20 }) },
  knowledgeOsSettings: { status: () => ({ configured: !empty, readEnabled: !empty, syncEnabled: !empty }) },
  serviceStatus: { configured: !empty, stages: Object.fromEntries(['asr','model','tts'].map(key => [key,{ configured: !empty }])) },
  wakeStatus: { enabled: !empty, desiredEnabled: !empty } });
const tasks = () => ({ receiver: 'listening', tasks: empty ? [] : [
  { taskLabel: 'DeskMate', state: 'working', receivedAt: now-60000 },
  { taskLabel: 'DeskMate', state: 'waiting', receivedAt: now-40000 },
  { taskLabel: 'KnowledgeOS', state: 'completed', receivedAt: now-100000 },
] });
const board = () => ({ available: false, boardConnected: false, xiaozhiHardware: { enabled: !empty } });
const record = (name, pass) => { assert(pass, name); assertions.push(name); };
app.whenReady().then(async () => {
  const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');
  const channels = [...new Set([...preload.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m=>m[1]))];
  channels.forEach(channel => ipcMain.handle(channel, (_event, payload) => {
    calls.push(channel);
    if (channel === 'workbench:get-overview') { if (failOverview) throw Error('isolated-ui-qa'); return overview(); }
    if (channel === 'prompts:command') return controller.command(payload);
    if (channel === 'desktop:get-capabilities') return { supported: true, platform: 'win32', inputBridge: board() };
    if (channel === 'desktop:get-codex-task-brief-status') return tasks();
    if (channel === 'desktop:register-shortcut') return { registered: false, shortcut: 'Ctrl+Shift+Space' };
    if (channel === 'desktop:list-registered-applications' || channel === 'desktop:list-applications') return [];
    if (/^memory:(get-|list)/.test(channel)) return null;
    return { ok: false, reason: 'isolated-ui-qa' };
  }));
  window = new BrowserWindow({ width: 1440, height: 1024, useContentSize: true, show: false,
    webPreferences: { preload: path.join(root,'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  window.setMenu(null);
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !/isolated-ui-qa|Refused to load the stylesheet 'https:\/\/fonts.googleapis.com/.test(message)) errors.push(message.slice(0, 220)); });
  const run = code => window.webContents.executeJavaScript(code);
  const waitFor = async (check, label) => { const deadline=Date.now()+5000; while (!await check()) { if(Date.now()>deadline) throw Error(`timeout: ${label}`); await pause(50); } };
  const click = async text => { await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`); await pause(160); };
  const shot = async name => fs.writeFileSync(path.join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  const load = async () => { await window.loadURL('about:blank'); await window.loadFile(path.join(root,'dist/client/index.html'), { hash: '/dashboard' }); await waitFor(() => run(`!!document.querySelector('.wb-metric') && !document.querySelector('.wb-refresh button').disabled`), 'overview ready'); await pause(500); };
  await load();
  record('four real-data metrics and five distinct connections', await run(`document.querySelectorAll('.wb-metric').length===4 && document.querySelectorAll('.wb-connection').length===5`));
  record('fixture displays accepted memory count, not candidate count', await run(`document.querySelectorAll('.wb-metric strong')[3].textContent.includes('12') && document.querySelectorAll('.wb-metric p')[3].textContent.includes('3')`));
  record('no fabricated hardware connection or task percentage', await run(`!document.querySelector('.wb-overview').textContent.includes('USB 已连接') && !document.querySelector('.progress-ring') && !document.querySelector('.wb-overview').textContent.includes('%')`));
  record('project reports are grouped with actionable priority', await run(`document.querySelectorAll('.wb-project').length===2 && document.querySelector('.wb-project').textContent.includes('2 个任务') && document.querySelector('.wb-project').textContent.includes('等你确认')`));
  record('seven days have exact accessible chart values', await run(`document.querySelectorAll('.wb-chart-day').length===7 && document.querySelector('.wb-chart').getAttribute('aria-label').includes('听写8次，陪伴6条')`));
  await shot('overview-1440-synthetic');
  record('DM brand loaded in header and sidebar without another shell', await run(`Array.from(document.querySelectorAll('.brand-logo')).length===2 && Array.from(document.querySelectorAll('.brand-logo')).every(i=>i.complete && i.naturalWidth===512) && getComputedStyle(document.querySelector('.wb-face')).backgroundColor==='rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.brand-mark')).borderWidth==='0px'`));
  const brandImage = nativeImage.createFromPath(path.join(root, 'public/assets/branding/deskmate-logo.png'));
  const pixels = brandImage.toBitmap();
  record('brand corners are truly transparent and body is near-opaque', pixels[3]===0 && pixels[(256*512+256)*4+3]>=250);
  await click('AI 陪伴');
  await waitFor(() => run(`document.querySelectorAll('.companion-face--soft').length===2 && Array.from(document.querySelectorAll('.companion-face--soft img')).every(i=>i.complete && i.naturalWidth===768)`), 'soft assets loaded');
  record('both live companion surfaces have a light background and contained faces', await run(`Array.from(document.querySelectorAll('.companion-face--soft')).every(f=>getComputedStyle(f).backgroundColor==='rgb(244, 249, 252)' && getComputedStyle(f.querySelector('img')).objectFit==='contain')`));
  await shot('companion-open-1440-synthetic');
  await run(`window.__eyeStates=[]; window.__eyeObserver=new MutationObserver(()=>{for(const f of document.querySelectorAll('.companion-face--soft'))window.__eyeStates.push(f.dataset.eyeState);});document.querySelectorAll('.companion-face--soft').forEach(f=>window.__eyeObserver.observe(f,{attributes:true,attributeFilter:['data-eye-state']}));`);
  await pause(8100);
  record('natural blinking closes and reopens without a voice session', await run(`window.__eyeStates.includes('closed') && window.__eyeStates.includes('open')`));
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pause(180);
  await run('window.__eyeStates=[]'); await pause(8000);
  record('live reduced-motion change cancels blinking and restores open eyes', await run(`window.__eyeStates.length===0 && Array.from(document.querySelectorAll('.companion-face--soft')).every(f=>f.dataset.eyeState==='open')`));
  const visualState = async state => { window.webContents.send('companion-conversation-event', { type: 'state', state, generation: 0 }); await pause(220); };
  await visualState('completed');
  record('both surfaces show friendly closed eyes after a reply', await run(`Array.from(document.querySelectorAll('.companion-face--soft')).every(f=>f.dataset.eyeState==='closed')`));
  await shot('companion-closed-1440-synthetic');
  await visualState('listening');
  record('listening reopens both faces, with no scaling or glow loop', await run(`Array.from(document.querySelectorAll('.companion-face--soft')).every(f=>f.dataset.eyeState==='open' && getComputedStyle(f).animationName==='none')`));
  window.setContentSize(960,680); await pause(400);
  record('companion has no horizontal overflow at 960', await run(`document.documentElement.scrollWidth<=innerWidth`));
  await shot('companion-960-synthetic');
  await visualState('idle');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  window.webContents.debugger.detach();
  window.setContentSize(1440,1024); await load();
  record('all primary panels visible at 1440x1024', await run(`document.querySelector('.wb-scene').getBoundingClientRect().bottom<=innerHeight && document.querySelector('.wb-projects').getBoundingClientRect().bottom<=innerHeight`));
  record('no horizontal overflow 1440', await run(`document.documentElement.scrollWidth<=innerWidth`));
  await shot('overview-1440-synthetic');
  for (const [text, hash] of [['打开提示词','#/prompts'],['按键配置','#/keymap'],['任务联动','#/companion/agents'],['记忆管理','#/memory']]) {
    await click(text); record(`${text} navigates to ${hash}`, await run(`location.hash===${JSON.stringify(hash)}`));
    if (text === '任务联动') record('task link opens the actual embedded agents section', await run(`document.querySelector('.companion-embedded .embedded-heading h2')?.textContent==='智能控制'`));
    await load();
  }
  failOverview = true; await click('刷新');
  record('IPC failure retains last successful metrics and shows warning', await run(`!!document.querySelector('.wb-load-error') && document.querySelectorAll('.wb-metric strong')[3].textContent.includes('12') && document.querySelector('.wb-connection').textContent.includes('状态读取异常')`));
  await shot('overview-read-failure-synthetic'); failOverview = false; await click('刷新');
  record('refresh recovers without resetting user data', await run(`!document.querySelector('.wb-load-error')`));
  window.setContentSize(960,680); await pause(400); await run('window.scrollTo(0,0)');
  record('no horizontal overflow 960', await run(`document.documentElement.scrollWidth<=innerWidth`));
  record('compact view preserves readable metric cards', await run(`document.querySelector('.wb-metric').getBoundingClientRect().width>=180`));
  await shot('overview-960-synthetic');
  empty = true; window.setContentSize(1440,1024); await load();
  record('zero records have zero metrics, no fake completed step or tasks', await run(`document.querySelectorAll('.wb-metric strong')[0].textContent==='0天' && !document.querySelector('.wb-project') && document.querySelector('.wb-step').textContent==='1'`));
  record('disabled Xiaozhi is neutral while desktop remains usable', await run(`document.querySelectorAll('.wb-connection')[2].textContent.includes('已关闭扩展') && document.querySelector('.wb-memory').textContent.includes('已暂停整理')`));
  await shot('overview-empty-synthetic');
  failOverview = true; await load();
  record('initial IPC failure displays unknown instead of zero usage', await run(`document.querySelectorAll('.wb-metric strong')[1].textContent==='—次' && !!document.querySelector('.wb-load-error')`));
  record('no unhandled renderer errors', errors.length===0);
  record('dashboard never requested summary, sync or hardware writes', !calls.some(c => /memory:(run|sync|set)|commit-keyboard|preview-keyboard|start-companion|start-recording/.test(c)));
  fs.writeFileSync(path.join(output,'report.json'), JSON.stringify({ kind:'isolated-synthetic-native-ui-qa', assertions, errors }, null, 2));
  console.log(JSON.stringify({ ok:true, checks:assertions.length, output })); app.exit(0);
}).catch(error => { console.error(error); console.error(JSON.stringify({ output, assertions, errors })); app.exit(1); });
