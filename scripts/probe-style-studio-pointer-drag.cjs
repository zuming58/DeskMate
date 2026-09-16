const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = process.env.DESKMATE_T47_PROBE_ASAR || root;
const output = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t47-pointer-drag-'));
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => app.exit(2), 30_000);

app.whenReady().then(async () => {
  let window;
  try {
    const errors = [];
    window = new BrowserWindow({
      show: false,
      width: 1440,
      height: 1024,
      useContentSize: true,
      webPreferences: {
        preload: path.join(root, 'scripts/probe-style-studio-functional-preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        offscreen: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !message.includes('fonts.googleapis.com')) errors.push(message); });
    await window.loadFile(path.join(product, 'dist/client/index.html'), { hash: '/style-studio' });
    await wait(900);
    const js = code => window.webContents.executeJavaScript(code);
    await js(`window.__dragEvents=[];for(const name of ['pointerdown','mousedown','dragstart','dragenter','dragover','drop','dragend','mouseup'])document.addEventListener(name,event=>window.__dragEvents.push({name,target:event.target?.className||event.target?.tagName,types:[...(event.dataTransfer?.types||[])]}),true);true`);
    const points = await js(`(()=>{const card=document.querySelector('.ss-materials .ss-photo:nth-child(2)'),slot=document.querySelector('.ss-machine');const a=card.getBoundingClientRect(),z=slot.getBoundingClientRect();return{from:{x:Math.round(a.left+a.width/2),y:Math.round(a.top+a.height/2)},to:{x:Math.round(z.left+z.width*.5),y:Math.round(z.top+28)}}})()`);
    const send = value => window.webContents.sendInputEvent(value);
    send({ type: 'mouseMove', ...points.from });
    send({ type: 'mouseDown', button: 'left', clickCount: 1, ...points.from });
    await wait(80);
    for (let step = 1; step <= 24; step++) {
      const x = Math.round(points.from.x + (points.to.x - points.from.x) * step / 24);
      const y = Math.round(points.from.y + (points.to.y - points.from.y) * step / 24);
      send({ type: 'mouseMove', button: 'left', x, y, movementX: 1, movementY: 1 });
      await wait(18);
    }
    await wait(120);
    const visual = await js(`(()=>{const machine=document.querySelector('.ss-machine'),inlet=document.querySelector('.ss-inlet'),ghost=document.querySelector('.ss-material-pull-ghost'),style=getComputedStyle(machine);return{ghost:Boolean(ghost),inletOver:inlet.classList.contains('is-over'),machineReceiving:machine.classList.contains('is-receiving'),slotLabel:document.querySelector('.ss-slot-label')?.textContent?.trim(),machineOpacity:style.opacity,machineTransform:style.transform}})()`);
    const screenshot = path.join(output, 'drag-hover-1440.png');
    fs.writeFileSync(screenshot, (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG());
    assert.equal(visual.ghost, true, 'one restrained photo ghost follows the pointer');
    assert.equal(visual.inletOver, true, 'only the upper inlet exposes the valid drop hint');
    assert.equal(visual.machineReceiving, false, 'the complete machine never enters a receiving visual state');
    assert.equal(visual.slotLabel, '原图进片口');
    assert.equal(visual.machineOpacity, '1');
    assert.equal(errors.length, 0, errors.join('\n'));
    send({ type: 'mouseUp', button: 'left', clickCount: 1, ...points.to });
    await wait(250);
    const result = await js(`({loaded:document.querySelector('.ss-inlet .ss-photo span')?.textContent?.trim(),status:document.querySelector('.ss-footer [role=status]')?.textContent?.trim(),events:window.__dragEvents})`);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ visual, result, screenshot, errors }, null, 2));
    console.log(JSON.stringify({ output, visual, result, screenshot, errors }, null, 2));
    assert.equal(result.loaded, '我的本地照片');
    assert(!result.events.some(event => event.name === 'dragstart'), 'material cards use the reliable page pointer path instead of Chromium native drag');
    window.destroy(); clearTimeout(deadline); app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'error.txt'), String(error.stack || error));
    console.error(error); console.log(`Evidence: ${output}`);
    window?.destroy(); clearTimeout(deadline); app.exit(1);
  }
});
