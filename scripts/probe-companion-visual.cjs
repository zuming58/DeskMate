// Isolated native renderer checks. No production profile, audio, hardware or network.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const product = process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t35-ui-'));
app.setPath('userData', directory); app.disableHardwareAcceleration();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win; const deadline = setTimeout(() => app.exit(2), 60000);
app.whenReady().then(async () => { try {
  win = new BrowserWindow({ show: false, width: 1440, height: 1024, webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  win.webContents.session.setPermissionRequestHandler((_w, _p, done) => done(false));
  win.webContents.session.webRequest.onBeforeRequest((details, done) => done({ cancel: !/^(file|data|devtools):/.test(details.url) }));
  const errors = []; win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && /Error/.test(message)) errors.push(message); });
  const js = code => win.webContents.executeJavaScript(code);
  const capture = async name => fs.writeFileSync(path.join(directory, name + '.png'), (await win.webContents.capturePage()).toPNG());
  await win.loadFile(path.join(product, 'dist/client/index.html'), { hash: '/companion' }); await pause(800);
  assert(await js(`!!document.querySelector('.companion-portrait')`), 'portrait mounted');
  assert(await js(`[...document.querySelectorAll('.companion-portrait img, .device-card img')].every(i=>i.complete && i.naturalWidth>0)`), 'all real assets loaded');
  assert.equal(await js(`getComputedStyle(document.querySelector('.device-card__screen')).backgroundColor`), 'rgba(0, 0, 0, 0)');
  assert.equal(await js(`getComputedStyle(document.querySelector('.device-card .companion-face')).backgroundColor`), 'rgba(0, 0, 0, 0)');
  assert.match(await js(`document.querySelector('.device-card').innerText.trim()`), /^EasyInput (已连接|未连接)$/);
  assert.equal(await js(`getComputedStyle(document.querySelector('.device-card')).borderRadius`), '16px');
  assert.equal(await js(`getComputedStyle(document.querySelector('.device-card')).backgroundColor`), 'rgb(45, 53, 65)');
  // Only the cyan sidebar blinks; rejected portrait blink stays disabled pending user video.
  assert.equal(await js(`document.querySelectorAll('.companion-portrait__eyelids').length`), 0);
  assert(await js(`new Promise(resolve=>{const p=document.querySelector('.device-card .companion-face');const end=setTimeout(()=>{o.disconnect();resolve(false)},9000);const o=new MutationObserver(()=>{if(p.dataset.eyeState==='closed'){clearTimeout(end);o.disconnect();resolve(true)}});o.observe(p,{attributes:true,attributeFilter:['data-eye-state']})})`), 'natural sidebar blink');
  await pause(55); await capture('companion-blink-1440'); await pause(220);
  assert.equal(await js(`document.querySelector('.companion-portrait').dataset.eyeState`), 'open');
  for (const [width, height] of [[1440, 1024], [1024, 768]]) {
    win.setSize(width, height); await pause(400);
    assert(await js(`document.documentElement.scrollWidth <= innerWidth+1`), 'no horizontal overflow');
    const bounds = await js(`(()=>{const r=document.querySelector('.companion-portrait').getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height,viewport:innerWidth}})()`);
    assert(bounds.x >= 0 && bounds.right <= bounds.viewport && Math.abs(bounds.width / bounds.height - 1.5) < 0.01, 'uncropped 3:2');
    await capture('companion-open-' + width);
  }
  win.setSize(1440, 1024); await pause(200);
  await js(`document.querySelector('[aria-label="收起侧栏"]').click();true`); await pause(200); await capture('companion-collapsed');
  await js(`document.querySelector('[aria-label="展开侧栏"]').click();true`);
  await js(`document.querySelector('.companion-portrait').scrollIntoView(); Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));true`);
  await pause(7500); assert.equal(await js(`document.querySelector('.companion-portrait').dataset.eyeState`), 'open', 'hidden pauses blink');
  await js(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));true`);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await pause(7500); assert.equal(await js(`document.querySelector('.companion-portrait').dataset.eyeState`), 'open', 'reduced motion pauses blink');
  win.webContents.debugger.detach();
  for (const [label, route] of [['按键配置','keymap'],['记忆管理','memory'],['提示词','prompts'],['AI 陪伴','companion']]) {
    assert(await js(`(()=>{const b=[...document.querySelectorAll('.sidebar__nav button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true})()`), 'real enabled navigation: '+label);
    await pause(250); assert.equal(await js(`location.hash`), '#/'+route, 'navigation actually changed: '+route);
  }
  await js(`location.hash='/history'`); await pause(250); assert.equal(await js(`!!document.querySelector('.companion-portrait')`), false, 'leave page unmounts timers');
  await js(`location.hash='/companion'`); await pause(500); assert(await js(`!!document.querySelector('.companion-portrait')`));
  await js(`document.querySelector('.companion-portrait__base').dispatchEvent(new Event('error'));true`); await pause(100);
  assert(await js(`!!document.querySelector('.companion-portrait__fallback')`), 'image failure has recovery copy');
  assert(await js(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始陪伴对话')&&!b.disabled)`), 'image failure does not disable voice control');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ ok: true, errors, fixture: 'isolated renderer, no real audio/hardware', product }, null, 2));
  console.log('T35 native image, blink, visibility, reduced-motion, navigation, fallback and layout checks passed. Captures: ' + directory);
  clearTimeout(deadline); win.destroy(); app.exit(0);
} catch (error) { console.error(error.stack); fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ ok: false, error: error.message })); console.log(directory); clearTimeout(deadline); win?.destroy(); app.exit(1); } });
