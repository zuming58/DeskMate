import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PromptWheelRouter } = require('../electron/prompt-wheel-router.cjs');
const { parseBridgeLine } = require('../electron/input-bridge-protocol.cjs');
const { InputBridgeManager } = require('../electron/input-bridge.cjs');
const { PromptWorkbenchController } = require('../electron/prompt-workbench-controller.cjs');
const { PromptWorkbenchStore } = require('../electron/prompt-workbench.cjs');
function harness() {
  let clock = 1000; const jobs = new Map(); const moves = [];
  const router = new PromptWheelRouter(s => moves.push(s), { now: () => clock,
    setTimer: fn => { const id = {}; jobs.set(id, fn); return id; }, clearTimer: id => jobs.delete(id) });
  return { router, moves, tick: () => { clock += 160; for (const [id, fn] of [...jobs]) { jobs.delete(id); fn(); } } };
}
test('raw wheel parser is source/axis/direction bounded and strips extras', () => {
  const e = { version: 1, type: 'board-wheel', source: 'easyinput-hid', key: 'vertical', action: 'negative', sequence: 1, time: new Date().toISOString(), path: 'private' };
  const parsed = parseBridgeLine(JSON.stringify(e)); assert(parsed); assert.equal(parsed.path, undefined);
  for (const invalid of [{source:'keyboard'}, {key:'movement'}, {action:'zero'}, {sequence:0}, {time:'invalid'}]) assert.equal(parseBridgeLine(JSON.stringify({...e,...invalid})), null);
  const manager = new InputBridgeManager(); const seen = []; manager.on('board-wheel', x => seen.push(x));
  manager.handleLine(JSON.stringify(e)); assert.deepEqual(seen, [parsed]);
  assert.equal(manager.snapshot().boardWheelCount, 1);
});
test('native wheel without any browser event works; duplicate DOM never selects twice', () => {
  for (const order of ['native-first', 'dom-first']) {
    const h = harness();
    if (order === 'native-first') { h.router.accept(1,'native'); h.router.accept(1,'dom'); }
    else { h.router.accept(1,'dom'); h.router.accept(1,'native'); }
    h.tick(); assert.deepEqual(h.moves,[1]);
  }
  const h = harness(); h.router.accept(-1,'native'); h.tick(); assert.deepEqual(h.moves,[-1]);
});
test('rapid raw steps, reverse, coalesced DOM, mouse fallback and teardown', () => {
  const h = harness(); h.router.accept(1,'dom');
  h.router.accept(1,'native'); h.router.accept(1,'native'); h.router.accept(-1,'native');
  h.router.accept(1,'dom'); h.router.accept(-1,'dom'); h.tick(); assert.deepEqual(h.moves,[1,1,-1]);
  h.router.reset(); h.router.accept(-1,'dom'); h.tick(); assert.deepEqual(h.moves,[1,1,-1,-1]);
  h.router.accept(1,'dom'); h.router.reset(); h.tick(); assert.equal(h.moves.length,4);
});
test('late raw arrival pairs an already-applied DOM fallback instead of double stepping', () => {
  const h = harness(); h.router.accept(1,'dom'); h.tick();
  h.router.accept(1,'native'); assert.deepEqual(h.moves,[1]);
  h.router.accept(1,'native'); assert.deepEqual(h.moves,[1,1]);
  h.router.reset(); h.router.accept(1,'dom'); h.tick(); h.tick(); h.tick(); h.tick();
  h.router.accept(1,'native'); assert.deepEqual(h.moves,[1,1,1,1]);
});
test('relative selection accumulates and copy flushes pending wheel before hiding', async () => {
  const store = new PromptWorkbenchStore(); let foreground = true; let copied;
  const c = new PromptWorkbenchController({store,isForeground:()=>foreground,writeClipboard:t=>copied=t,hide:()=>foreground=false,restore:async()=>({ok:true})});
  const rows = c.snapshot().rows;
  await c.command({type:'move',step:1}); await c.command({type:'move',step:1});
  assert.equal(c.snapshot().selectedId,rows[2].id);
  await c.command({type:'wheel',source:'dom',step:1}); await c.key(4);
  assert.equal(copied,rows[3].body); assert.equal(foreground,false);
  await c.command({type:'wheel',source:'native',step:1}); assert.equal(c.snapshot().selectedId,rows[3].id);
  foreground=true; await c.command({type:'editing',active:true}); await c.command({type:'wheel',source:'native',step:1});
  assert.equal(c.snapshot().selectedId,rows[3].id); c.wheel.reset();
});
