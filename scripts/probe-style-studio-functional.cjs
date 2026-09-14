const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-t38-functional-'));
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => app.exit(2), 45_000);

app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ show: false, width: 1440, height: 1024, useContentSize: true, webPreferences: { preload: path.join(root, 'scripts/probe-style-studio-functional-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: false, offscreen: true, backgroundThrottling: false } });
    const errors = [];
    window.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !message.includes('fonts.googleapis.com')) errors.push(message); });
    window.webContents.session.webRequest.onBeforeRequest((details, done) => done({ cancel: !/^(file|data|blob):/.test(details.url) }));
    const js = code => window.webContents.executeJavaScript(code);
    const click = async selector => { await js(`document.querySelector(${JSON.stringify(selector)}).click();true`); await wait(180); };
    const shot = async name => fs.writeFileSync(path.join(output, `${name}.png`), (await window.webContents.capturePage()).resize({ width: 1440 }).toPNG());
    await window.loadFile(path.join(root, 'dist/client/index.html'), { hash: '/style-studio' });
    await wait(900);
    assert.equal(await js(`document.querySelector('.ss-badge').textContent`), '百炼已配置');
    assert.equal(await js(`document.querySelectorAll('.ss-materials .ss-photo').length`), 2);
    await click('.ss-materials .ss-photo:nth-child(2)');
    assert.equal(await js(`document.querySelector('.ss-control > .ss-primary').textContent`), '生成作品');
    await click('.ss-control > .ss-primary');
    assert.match(await js(`document.querySelector('.ss-confirm-dialog h2').textContent`), /纸间光影/);
    await shot('consent-1440');
    await click('.ss-confirm-dialog .ss-primary');
    await wait(900);
    assert.equal(await js(`document.querySelectorAll('.ss-results .ss-photo').length`), 4);
    assert.match(await js(`document.querySelector('.ss-dialog h3').textContent`), /本地生成作品/);
    const state = await js(`window.__styleProbe.state()`);
    assert.equal(state.generated.length, 1);
    assert.equal(state.generated[0].consent, true);
    assert.equal(state.generated[0].sourceId, 'source-0123456789abcdef01234567');
    await shot('generated-1440');
    await js(`[...document.querySelectorAll('.ss-dialog-actions button')].find(button=>button.innerText==='从本地库删除').click();true`); await wait(180);
    assert.match(await js(`document.querySelector('.ss-confirm-dialog h2').textContent`), /删除/);
    await shot('delete-1440');
    await click('.ss-confirm-dialog .ss-primary');
    assert.equal(await js(`document.querySelectorAll('.ss-results .ss-photo').length`), 3);
    assert.deepEqual(await js(`window.__styleProbe.state().removed`), ['result-01234567-89ab-4cde-8123-0123456789ab']);
    await js(`[...document.querySelectorAll('.sidebar__nav button')].find(button=>button.innerText==='AI 陪伴').click();true`);
    await wait(200);
    assert((await js(`window.__styleProbe.state().released`)) >= 1);
    assert.equal(errors.length, 0, errors.join('\n'));
    const finalState = await js(`window.__styleProbe.state()`);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, output, state: finalState, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, output }));
    window.destroy(); clearTimeout(deadline); app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'error.txt'), String(error.stack || error));
    console.error(error); console.log(`Evidence: ${output}`);
    window?.destroy(); clearTimeout(deadline); app.exit(1);
  }
});
