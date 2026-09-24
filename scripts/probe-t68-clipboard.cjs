// Standalone Electron 44 probe: isolated profile, no app bootstrap, API or devices.
const { app, clipboard, ClipboardItem } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.DESKMATE_PROBE_ASAR || path.resolve(__dirname, '..');
const { createClipboardAccess } = require(path.join(root, 'electron/clipboard-access.cjs'));
const { PromptWorkbenchController } = require(path.join(root, 'electron/prompt-workbench-controller.cjs'));
const { PromptWorkbenchStore } = require(path.join(root, 'electron/prompt-workbench.cjs'));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-t68-clipboard-')));
app.disableHardwareAcceleration();
const resultFile = path.join(os.tmpdir(), 'deskmate-t68-clipboard-result.json');
let stage = 'starting';
const deadline = setTimeout(() => {
  fs.writeFileSync(resultFile, JSON.stringify({ ok: false, stage, timedOut: true }));
  app.exit(2);
}, 30_000);
app.whenReady().then(async () => {
  const access = createClipboardAccess(clipboard, ClipboardItem);
  let snapshot, failure, errorName;
  try {
    stage = 'snapshot';
    snapshot = await access.snapshot();
    stage = 'async-contract';
    const read = clipboard.readText();
    assert.equal(typeof read.then, 'function');
    assert.notEqual(read, 'synthetic'); // Old immediate comparison always rejects a Promise.
    await read;
    stage = 'text-roundtrip';
    for (const text of ['synthetic', '  中文\n{{literal}} $&  ', 'a\r\nb']) {
      await access.writeText(text); assert.equal(await access.readText(), text);
    }
    stage = 'mixed-format-snapshot';
    await clipboard.write([new ClipboardItem({ 'text/plain': 'synthetic', 'text/html': '<b>synthetic</b>' })]);
    const mixed = await access.snapshot();
    await access.writeText('marker');
    await access.restore(mixed);
    assert.equal(await access.readText(), 'synthetic');
    const items = await clipboard.read();
    assert(items.some(item => item.types.includes('text/html')));
    let foreground = false, restored = false;
    stage = 'key4-controller';
    const store = new PromptWorkbenchStore(); // In-memory; never opens production profile.
    const controller = new PromptWorkbenchController({ store, isForeground: () => foreground,
      capture: async () => {}, show: () => { foreground = true; }, hide: () => { foreground = false; },
      restore: async () => { restored = true; return { ok: true }; }, writeClipboard: access.writeText });
    await controller.key(4); const selected = controller.snapshot().selectedId;
    assert.equal((await controller.key(4)).ok, true);
    assert.equal(await access.readText(), store.get(selected).body);
    assert.equal(foreground, false); assert.equal(restored, true);
  } catch (error) { failure = true; errorName = error.name; }
  finally {
    if (snapshot) { try { await access.restore(snapshot); } catch { failure = true; stage = 'restore'; } }
  }
  const result = { ok: !failure, stage, errorName, electron: process.versions.electron, isolated: true, clipboardRestored: !!snapshot && !failure };
  fs.writeFileSync(resultFile, JSON.stringify(result));
  console.log(JSON.stringify(result));
  clearTimeout(deadline);
  app.exit(failure ? 1 : 0);
});
