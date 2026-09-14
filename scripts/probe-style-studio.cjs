// Hidden production-renderer QA only. Never loads product main/preload or a retained profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const product = process.env.DESKMATE_T38_PROBE_ASAR || process.env.DESKMATE_T37_PROBE_ASAR || root;
const output = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t37-qa-'));
app.setPath('userData', path.join(output,'profile')); app.disableHardwareAcceleration();
const delay = ms => new Promise(r=>setTimeout(r,ms));
const deadline = setTimeout(()=>app.exit(2),60000);
app.whenReady().then(async()=>{ let window; try {
  window = new BrowserWindow({show:false,width:1440,height:1024,useContentSize:true,webPreferences:{nodeIntegration:false,contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  window.webContents.session.setPermissionRequestHandler((_w,_p,done)=>done(false));
  window.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:!/^(file|data|blob|devtools):/.test(d.url)}));
  const errors=[], baselineWarnings=[]; window.webContents.on('console-message',(_e,level,message)=>{if(level>=3){if(message.includes("Refused to load the stylesheet 'https://fonts.googleapis.com/")&&message.includes('Content Security Policy'))baselineWarnings.push(message);else errors.push(message)}});
  let downloaded=false;
  window.webContents.session.on('will-download',(_e,item)=>{item.setSavePath(path.join(output,'saved-sample.png'));item.on('done',(_event,state)=>{downloaded=state==='completed'})});
  const js = code=>window.webContents.executeJavaScript(code);
  const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click();true`);await delay(100)};
  const shot=async name=>fs.writeFileSync(path.join(output,name+'.png'),(await window.webContents.capturePage()).resize({width:window.getContentSize()[0]}).toPNG());
  await window.loadFile(path.join(product,'dist/client/index.html'),{hash:'/style-studio'}); await delay(1100);
  assert(await js(`!!document.querySelector('.style-studio')`));
  assert(await js(`[...document.querySelectorAll('.style-studio img')].every(i=>i.complete&&i.naturalWidth>0)`),'assets loaded');
  assert.equal(await js(`getComputedStyle(document.querySelector('.style-studio')).backgroundColor`),'rgb(255, 255, 255)');
  const nav=await js(`[...document.querySelectorAll('.sidebar__nav button')].map(x=>x.innerText)`);
  assert.equal(nav[nav.indexOf('AI 陪伴')+1],'风格映像');
  assert(await js(`document.documentElement.scrollWidth<=innerWidth+1`),'no overflow at 1440');
  await shot('generate-1440');
  await click('[aria-label="下一个风格"]'); assert.equal(await js(`document.querySelector('.ss-description h1').textContent`),'毛线手作');
  await click('.ss-keys button'); assert.equal(await js(`document.querySelector('.ss-description h1').textContent`),'调整风格强度');
  await click('[aria-label="下一个风格"]'); assert.equal(await js(`document.querySelector('.ss-strength strong').textContent`),'70%');
  await click('.ss-control > .ss-primary'); assert.equal(await js(`document.querySelector('.ss-description h1').textContent`),'毛线手作');
  await click('.ss-control > .ss-primary'); await delay(1800); assert(await js(`!!document.querySelector('[role=dialog]')`));
  assert.equal(await js(`document.querySelectorAll('.ss-results .ss-photo').length`),4);
  await shot('result-1440'); await click('.ss-dialog-actions button:first-child'); await delay(500); assert(downloaded,'sample saved to QA directory');
  await click('.ss-dialog-actions button:nth-child(2)'); assert(await js(`document.querySelector('.ss-enlarged').src.endsWith('source.png')`));
  await click('.ss-dialog-actions button:nth-child(3)'); assert(await js(`!!document.querySelector('.ss-reveal canvas')`));
  for(let i=1;i<=6;i++) await click(`.ss-effects button:nth-child(${i})`);
  await shot('reveal-1440'); await click('.ss-tabs button:first-child');
  await click('.ss-outline'); await shot('prompt-1440'); await click('.ss-close');
  // Synthetic focus is local to this hidden renderer; never focuses the real desktop.
  await js(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit7',bubbles:true}));true`); await delay(100);
  assert.equal(await js(`document.querySelector('.ss-description h1').textContent`),'纸间光影');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));true`); await delay(100);
  assert.equal(await js(`document.querySelector('.ss-description h1').textContent`),'毛线手作');
  for(const width of [1024,800]) {window.setContentSize(width,768);await delay(400);await shot('generate-'+width);fs.writeFileSync(path.join(output,'bounds-'+width+'.json'),JSON.stringify(await js(`[...document.querySelectorAll('.style-studio *')].map(e=>({class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(x=>x.right>innerWidth+1)`)));assert(await js(`document.documentElement.scrollWidth<=innerWidth+1`),'no overflow at '+width)}
  window.setContentSize(1440,1024);await delay(200);
  for(const text of ['AI 陪伴','按键配置','提示词','风格映像']) {await js(`[...document.querySelectorAll('.sidebar__nav button')].find(x=>x.innerText===${JSON.stringify(text)}).click();true`);await delay(220);}
  assert(await js(`!!document.querySelector('.style-studio')`),'route reentry');
  await shot('generate-final-1440');
  // Upload only a repository-generated fixture, never user photos. Concurrent batches must not exceed cap.
  await js(`(async()=>{const blob=await fetch(document.querySelector('.ss-loaded img').src).then(r=>r.blob()); const send=()=>{const dt=new DataTransfer();for(let i=0;i<8;i++)dt.items.add(new File([blob],'fixture-'+i+'.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))};send();send();return true})()`);
  await delay(800); assert.equal(await js(`document.querySelectorAll('.ss-materials .ss-photo').length`),9,'eight managed imports plus sample');
  await click('.ss-control > .ss-primary'); assert(await js(`document.querySelector('.ss-footer [role=status]').textContent.includes('浏览器预览')`));
  assert.equal(await js(`document.querySelectorAll('.ss-results .ss-photo').length`),3,'no fake transform for upload');
  const beforeUnload=await js(`(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()`); assert(beforeUnload,'upload has leave guard');
  await shot('upload-1440');
  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,output,checks:'assets/nav/orbit/strength/print/enlarge/compare/effects/prompt/keyboard/responsive/reentry',consoleErrors:errors,baselineWarnings},null,2));
  console.log(JSON.stringify({passed:true,output}));
  window.destroy();clearTimeout(deadline);app.exit(0);
}catch(error){fs.writeFileSync(path.join(output,'error.txt'),String(error.stack));console.error(error);console.log('Evidence: '+output);clearTimeout(deadline);app.exit(1)}});
