import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createClipboardAccess } = require('../electron/clipboard-access.cjs');
const { PromptWorkbenchController } = require('../electron/prompt-workbench-controller.cjs');
const { PromptWorkbenchStore } = require('../electron/prompt-workbench.cjs');
const { pasteIntoCapturedWindow } = require('../electron/active-window-output.cjs');
const { captureSelectedText } = require('../electron/selection-capture.cjs');
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('T68 KEY4 awaits real async write/read before usage, hide and restore', async () => {
  const write = defer(), read = defer(); const calls = []; let foreground = false, value = '';
  const access = createClipboardAccess({
    async writeText(text) { await write.promise; value = text; calls.push('write'); },
    async readText() { await read.promise; calls.push('read'); return value; },
  });
  const store = new PromptWorkbenchStore();
  const controller = new PromptWorkbenchController({ store, isForeground: () => foreground,
    capture: async () => {}, show: () => { foreground = true; },
    hide: () => { foreground = false; calls.push('hide'); },
    restore: async () => { calls.push('restore'); return { ok: true }; }, writeClipboard: access.writeText,
  });
  await controller.key(4); const pending = controller.key(4);
  await Promise.resolve(); assert.deepEqual(calls, []); assert.equal(store.data.usage.length, 0);
  assert.equal((await controller.key(4)).ok, false); // busy; no second transaction
  write.resolve(); await new Promise(setImmediate); assert.deepEqual(calls, ['write']);
  read.resolve(); assert.equal((await pending).ok, true);
  assert.deepEqual(calls, ['write', 'read', 'hide', 'restore']); assert.equal(store.data.usage.length, 1);
});

test('T68 rejected write/read or mismatching text keeps page and usage intact', async () => {
  for (const failure of ['write', 'read', 'mismatch']) {
    const access = createClipboardAccess({
      async writeText() { if (failure === 'write') throw Error('denied'); },
      async readText() { if (failure === 'read') throw Error('denied'); return 'unrelated'; },
    });
    const store = new PromptWorkbenchStore(); let hidden = false;
    const controller = new PromptWorkbenchController({ store, isForeground: () => true, hide: () => { hidden = true; }, writeClipboard: access.writeText });
    controller.snapshot(); assert.equal((await controller.key(4)).ok, false);
    assert.equal(hidden, false); assert.equal(store.data.usage.length, 0);
  }
});

test('T68 literal text remains exact, including whitespace, CRLF and templates', async () => {
  for (const value of ['', '  {{literal}} $&\n中文  ', 'one\r\ntwo', '😀\ttext']) {
    let stored;
    const access = createClipboardAccess({ async writeText(text) { stored = text; }, async readText() { return stored; } });
    await access.writeText(value); assert.equal(stored, value);
  }
});

test('T68 voice paste waits for copy completion and never pastes on rejected copy', async () => {
  const gate = defer(); let pasted = false;
  const pending = pasteIntoCapturedWindow({ text: 'synthetic', targetWindow: '42', writeClipboard: () => gate.promise,
    runPaste: async () => { pasted = true; return { ok: true }; } });
  await Promise.resolve(); assert.equal(pasted, false); gate.resolve(); assert.equal((await pending).ok, true);
  pasted = false;
  const result = await pasteIntoCapturedWindow({ text: 'synthetic', targetWindow: '42', writeClipboard: async () => { throw Error('denied'); }, runPaste: () => { pasted = true; } });
  assert.equal(result.reason, 'clipboard-write-failed'); assert.equal(pasted, false);
});

test('T68 snapshot materializes all MIME payloads before overwriting and restores them', async () => {
  class Item { constructor(data) { this.data = data; } }
  const payloads = { 'text/plain': new Blob(['sample']), 'text/html': new Blob(['<b>sample</b>']), 'image/png': new Blob([new Uint8Array([1,2,3])]) };
  let changed = false, restored, cleared = false;
  const access = createClipboardAccess({
    async read() { return [{ types: Object.keys(payloads), async getType(type) { assert.equal(changed, false); return payloads[type]; } }]; },
    async write(items) { restored = items; }, async clear() { cleared = true; },
  }, Item);
  const snapshot = await access.snapshot(); changed = true; await access.restore(snapshot);
  assert.deepEqual(restored[0].data, payloads); await access.restore([]); assert.equal(cleared, true);
});

test('T68 empty native clipboard item restores as empty, not an invalid ClipboardItem', async () => {
  let cleared = false;
  const access = createClipboardAccess({ async read() { return [{ types: [] }]; }, clear() { cleared = true; } }, class { constructor() { throw Error('empty item invalid'); } });
  const snapshot = await access.snapshot(); assert.deepEqual(snapshot, []);
  await access.restore(snapshot); assert.equal(cleared, true);
});

test('T68 selected text uses async snapshot/marker/read/restore, no Promise text', async () => {
  let value = 'original'; const events = [];
  const result = await captureSelectedText({ targetWindow: '42',
    snapshotClipboard: async () => { events.push('snapshot'); return value; },
    writeClipboardText: async text => { await Promise.resolve(); value = text; events.push('marker'); },
    runCopy: async () => { assert(value.startsWith('deskmate-selection-')); value = 'selection'; events.push('copy'); return { ok: true }; },
    readClipboardText: async () => value,
    restoreClipboard: async snapshot => { await Promise.resolve(); value = snapshot; events.push('restore'); },
  });
  assert.deepEqual(result, { ok: true, text: 'selection' }); assert.equal(value, 'original');
  assert.deepEqual(events, ['snapshot', 'marker', 'copy', 'restore']);
});

test('T68 selection clipboard failures fail closed and restore where possible', async () => {
  for (const failing of ['snapshot', 'marker', 'read', 'restore']) {
    const events = [];
    const op = async name => { events.push(name); if (name === failing) throw Error('failure'); return 'original'; };
    const result = await captureSelectedText({ targetWindow: '42', snapshotClipboard: () => op('snapshot'),
      writeClipboardText: () => op('marker'), readClipboardText: () => op('read'), restoreClipboard: () => op('restore'),
      runCopy: async () => ({ ok: true }) });
    assert.equal(result.ok, false);
    assert.equal(events.includes('restore'), failing !== 'snapshot');
    if (failing === 'snapshot') assert.deepEqual(events, ['snapshot']);
  }
});

test('T68 main clipboard paths use shared async adapter, including truthful IPC success', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert(!/clipboard\.(?:readText|writeText|readHTML|readRTF|readBookmark|readImage|write)\(/.test(main));
  assert(main.includes('await systemClipboard.writeText(text)'));
  assert(main.includes('writeClipboard: systemClipboard.writeText'));
});
