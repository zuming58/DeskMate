// Opt-in Windows test: synthetic text is sent only to this test's own textarea.
const { app, BrowserWindow, clipboard } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { InputBridgeManager } = require('../electron/input-bridge.cjs');
app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'deskmate-output-probe-')));
let window, bridge, saved;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    saved = clipboard.availableFormats().map(format => [format, clipboard.readBuffer(format)]);
    window = new BrowserWindow({ width: 600, height: 250, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<h3>DeskMate 输入验证（仅合成文字）</h3><textarea autofocus style="width:95%;height:100px"></textarea>'));
    window.show(); window.focus(); await pause(700);
    await window.webContents.executeJavaScript('document.querySelector("textarea").focus()');
    const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
    const captureSource = source.match(/const FOREGROUND_SCRIPT = ([\s\S]*?\.join\("; "\));/)[1];
    const script = require('node:vm').runInNewContext(captureSource);
    const captured = await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
    const ownHandle = window.getNativeWindowHandle().readBigUInt64LE().toString();
    console.log(JSON.stringify({ captureMatchedOwnedWindow: captured === ownHandle }));
    bridge = new InputBridgeManager({ executable: path.resolve('native/DeskMate.InputBridge/publish/DeskMate.InputBridge.exe') });
    bridge.start(); await pause(1200);
    app.focus({ steal: true }); window.setAlwaysOnTop(true); window.show(); window.focus();
    await window.webContents.executeJavaScript('document.querySelector("textarea").focus()');
    await pause(300);
    clipboard.writeText('DeskMate synthetic paste 123');
    const result = await bridge.pasteActiveWindow(ownHandle);
    await pause(300);
    const inserted = await window.webContents.executeJavaScript('document.querySelector("textarea").value === "DeskMate synthetic paste 123"');
    console.log(JSON.stringify({ result, inserted }));
    if (!inserted && process.argv.includes('--compare-legacy')) {
      const legacy = require('../electron/active-window-output.cjs').PASTE_CAPTURED_WINDOW_SCRIPT;
      const oldResult = await new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', legacy], { windowsHide: true, env: { ...process.env, DESKMATE_TARGET_WINDOW: ownHandle } }, error => resolve({ ok: !error })));
      await pause(300);
      const oldInserted = await window.webContents.executeJavaScript('document.querySelector("textarea").value === "DeskMate synthetic paste 123"');
      console.log(JSON.stringify({ legacy: oldResult, legacyInserted: oldInserted }));
    }
    process.exitCode = result.ok && inserted ? 0 : 1;
  } catch (error) { console.log(JSON.stringify({ error: error.message })); process.exitCode = 1; }
  finally { bridge?.stop(); if (saved && clipboard.readText() === 'DeskMate synthetic paste 123') { clipboard.clear(); for (const [format, buffer] of saved) clipboard.writeBuffer(format, buffer); } window?.destroy(); app.exit(process.exitCode || 0); }
});
