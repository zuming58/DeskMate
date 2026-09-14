import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { processVoiceRecording, voiceCompletionMessage } from '../src/services/voicePipeline.js';
import { createDiagnosticReport } from '../src/services/diagnostics.js';
const require = createRequire(import.meta.url);
const { OpenAiStreamingCompanionModelAdapter } = require('../electron/companion-model-adapter.cjs');
const { CompanionDialogueContext } = require('../electron/companion-dialogue-context.cjs');
const { ThreeStageCompanionProvider } = require('../electron/three-stage-companion-provider.cjs');
const { InputBridgeManager } = require('../electron/input-bridge.cjs');
const { createVoiceOverlayPresenter } = require('../electron/voice-overlay-presenter.cjs');
const { waitForRetry } = require('../electron/companion-model-transport.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = text => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });
const config = { provider: 'custom', endpoint: 'https://synthetic.invalid/chat', apiKey: 'test-only', model: 'test' };
const model = (fetchImpl, options = {}) => new OpenAiStreamingCompanionModelAdapter({ config, fetchImpl, retryWait: async () => {}, ...options });
const disconnect = () => Object.assign(new TypeError('SECRET raw error'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT', address: 'SECRET address' } });

test('T29 pre-response network retry reuses exact body and commits one user/answer', async () => {
  const requests = [], statuses = [], deltas = [];
  const context = new CompanionDialogueContext();
  const adapter = model(async (_, options) => { requests.push(options); if (requests.length === 1) throw disconnect(); return reply('重试成功。'); }, { dialogueContext: context });
  await adapter.streamTurn({ text: '请讲个短故事', onDelta: text => deltas.push(text), onStatus: event => statuses.push(event) });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(requests[0].signal, requests[1].signal);
  assert.deepEqual(context.messages().map(row => row.role), ['user', 'assistant']);
  assert.deepEqual(deltas, ['重试成功。']);
  assert.equal(statuses[0].type, 'retrying');
  assert.equal(adapter.diagnostics().timings.modelHttpAttempts, 2);
  assert.equal(adapter.diagnostics().timings.modelRetries, 1);
  assert.equal(adapter.diagnostics().lastFailure, null);
});

test('T29 two network failures end bounded and retain only allowed network cause', async () => {
  let calls = 0;
  const adapter = model(async () => { calls++; throw disconnect(); });
  await assert.rejects(adapter.streamTurn({ text: '请回答这句话' }), error => {
    assert.equal(error.failure.networkCode, 'UND_ERR_CONNECT_TIMEOUT');
    assert.equal(error.failure.failureClass, 'network');
    assert.equal(error.recoverable, true);
    assert.doesNotMatch(JSON.stringify(error), /SECRET/); return true;
  });
  assert.equal(calls, 2);
  assert.equal(adapter.diagnostics().retainedMessages, 1);
});

test('T29 private draft, auth, rate-limit, Retry-After and server no-retry header never auto retry', async () => {
  for (const kind of ['draft', 'auth', 'rate', 'after', 'denied']) {
    let calls = 0;
    const adapter = model(async () => {
      calls++;
      if (kind === 'draft') throw disconnect();
      return { ok: false, status: kind === 'auth' ? 401 : kind === 'rate' ? 429 : 503, headers: { get: key => kind === 'after' && key === 'retry-after' ? '60' : kind === 'denied' && key === 'x-should-retry' ? 'false' : null } };
    });
    const text = '普通话题测试';
    const draft = kind === 'draft' ? adapter.prepareDraft(text) : null;
    await assert.rejects(adapter.streamTurn({ text, draft }));
    assert.equal(calls, 1, kind);
  }
});

test('T29 503 before headers can retry; no body data is consumed from failed response', async () => {
  let calls = 0, cancelled = 0;
  const adapter = model(async () => ++calls === 1 ? { ok: false, status: 503, body: { cancel: async () => { cancelled++; } }, json: () => assert.fail('must not consume failed body') } : reply('恢复回答。'));
  const result = await adapter.streamTurn({ text: '正常对话' });
  assert.equal(result.text, '恢复回答。'); assert.equal(cancelled, 1); assert.equal(calls, 2);
});

test('T29 cancellation during backoff prevents another request or late context write', async () => {
  const abort = new AbortController(); let calls = 0;
  const adapter = model(async () => { calls++; throw disconnect(); }, { retryWait: async () => abort.abort() });
  await assert.rejects(adapter.streamTurn({ text: '取消测试', signal: abort.signal }), /cancelled/);
  assert.equal(calls, 1);
  assert.equal(adapter.diagnostics().lastFailure, null);
});

test('T29 stop aborts real retry wait promptly', async () => {
  const abort = new AbortController(); const promise = waitForRetry(60000, abort.signal); abort.abort();
  await assert.rejects(promise, /cancelled/);
});

test('T29 no replay after streaming starts or malformed result', async () => {
  for (const kind of ['partial', 'empty', 'malformed']) {
    let calls = 0; const deltas = [];
    const adapter = model(async () => {
      calls++;
      if (kind === 'empty') return reply('');
      if (kind === 'malformed') return { ok: true, json: async () => { throw new SyntaxError('SECRET'); } };
      return { ok: true, body: (async function* () { yield Buffer.from('data: {"choices":[{"delta":{"content":"已经输出。"}}]}\n\n'); throw disconnect(); })() };
    });
    await assert.rejects(adapter.streamTurn({ text: '请说两句', onDelta: text => deltas.push(text) }));
    assert.equal(calls, 1);
    assert.deepEqual(deltas, kind === 'partial' ? ['已经输出。'] : []);
  }
});

test('T29 provider delayed notice belongs to current turn and recovered retry speaks once', async () => {
  let calls = 0, asr, release;
  const timers = new Set(), events = [], spoken = [];
  const adapter = model(async () => { if (++calls === 1) throw disconnect(); return new Promise(resolve => { release = () => resolve(reply('最终回答。')); }); });
  const provider = new ThreeStageCompanionProvider({
    schedule: callback => { timers.add(callback); return callback; }, cancelSchedule: callback => timers.delete(callback),
    asrFactory: ({ onEvent }) => { asr = onEvent; return { connect: async () => {}, close() {} }; }, modelFactory: () => adapter,
    ttsFactory: () => ({ connect: async () => {}, synthesize: async text => spoken.push(text), close() {} }), onEvent: event => events.push(event),
  });
  await provider.connect(); asr({ type: 'final', text: '来个普通回答' }); await tick();
  assert.equal(events.some(event => event.type === 'model.status' && event.status === 'retrying'), true);
  const waiting = [...timers][0]; waiting();
  assert.equal(events.some(event => event.status === 'waiting'), true);
  release(); await tick(); await tick();
  assert.deepEqual(spoken, ['最终回答。']);
  const count = events.length; waiting(); assert.equal(events.length, count);
  assert.equal(timers.size, 0); provider.close();
});

test('T29 overlay keeps node identity and shows explicit listening recovery message', () => {
  let htmlWrites = 0, render;
  const nodes = { '.shell': {}, '.copy': {}, '.meter': {} };
  const bars = Array.from({ length: 13 }, () => ({ style: { setProperty() {} } }));
  const root = { set innerHTML(_) { htmlWrites++; }, querySelector: key => nodes[key], querySelectorAll: () => bars };
  const source = fs.readFileSync(new URL('../electron/overlay-preload.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(source, { require: () => ({ contextBridge: { exposeInMainWorld() {} }, ipcRenderer: { on: (_, callback) => { render = callback; } } }), window: { addEventListener: (_, callback) => callback() }, document: { getElementById: () => root } });
  for (let level = 0; level < 100; level++) render(null, { state: 'recording', level, message: '网络未连上，我还在听' });
  assert.equal(htmlWrites, 1);
  assert.equal(nodes['.copy'].textContent, '网络未连上，我还在听');
  render(null, { state: 'recording', transcript: '<script>test</script>' });
  assert.equal(nodes['.copy'].textContent, '<script>test</script>');
  assert.equal(htmlWrites, 1);
});

test('T29 one overlay presenter suppresses repeated show and stale terminal timers', () => {
  let visible = false, shown = 0, hidden = 0;
  const timers = [], cancelled = [];
  const window = { webContents: { send() {} }, isDestroyed: () => false, isVisible: () => visible, hide: () => { visible = false; hidden++; } };
  const present = createVoiceOverlayPresenter({ getWindow: () => window, show: () => { visible = true; shown++; }, schedule: callback => { timers.push(callback); return timers.length; }, cancel: timer => cancelled.push(timer) });
  for (let index = 0; index < 100; index++) present({ state: 'recording' });
  assert.equal(shown, 1);
  present({ state: 'completed' }); const old = timers[0];
  present({ state: 'recording' }); old(); assert.equal(hidden, 0);
  present({ state: 'completed' }); old(); assert.equal(hidden, 0);
  timers[1](); assert.equal(hidden, 1); assert.ok(cancelled.includes(1));
  present({ state: 'recording' }); present({ state: 'idle' }); assert.equal(hidden, 2);
});

test('T29 output and history wait are separate; raw success never claims model organization', async () => {
  let at = 0, finishHistory; const phases = [];
  const pipeline = processVoiceRecording({ now: () => at, organizerOptions: { mode: 'raw' },
    stt: { transcribe: async () => ({ status: 'success', text: 'test' }) }, organizer: { organize: async text => ({ status: 'success', text, mode: 'raw' }) },
    saveHistory: () => new Promise(resolve => { finishHistory = resolve; }),
    output: { output: async () => { at = 8; return { ok: true, mode: 'active-window' }; } }, outputMode: 'active-window',
    onPhase: phase => phases.push(phase),
  });
  await tick(); assert.equal(phases.at(-1), 'saving'); at = 108; finishHistory({});
  const result = await pipeline;
  assert.equal(result.timing.outputMs, 8); assert.equal(result.timing.historyWaitMs, 100);
  assert.equal(voiceCompletionMessage(result), '已输入');
  assert.equal(voiceCompletionMessage({ output: { mode: 'clipboard' }, organized: { mode: 'smart' } }), '整理完成，已复制到剪贴板');
});

test('T29 expired/late native paste acknowledgements cannot resolve a newer command', async () => {
  const writes = [], timers = [];
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  child.stdin = { writable: true, write: (line, callback) => { writes.push({ command: JSON.parse(line), callback }); } };
  const manager = new InputBridgeManager({ executable: 'test', spawnImpl: () => child, setTimer: callback => { timers.push(callback); return timers.length; }, clearTimer() {} }); manager.start();
  const first = manager.pasteActiveWindow('12345');
  assert.equal(writes[0].command.expiresUnixMs > Date.now(), true);
  assert.equal((await manager.pasteActiveWindow('45678')).reason, 'active-window-output-busy');
  timers[0](); assert.equal((await first).reason, 'active-window-output-timeout');
  const second = manager.pasteActiveWindow('45678'); let completed = false; second.then(() => { completed = true; });
  const ack = requestId => manager.handleLine(JSON.stringify({ version: 1, type: 'desktop-output-result', source: 'desktop-output', requestId, ok: true, time: new Date().toISOString(), sequence: 1 }));
  ack(writes[0].command.requestId); writes[0].callback(new Error('late')); await tick(); assert.equal(completed, false);
  ack(writes[1].command.requestId); assert.equal((await second).ok, true);
  manager.stop();
});

test('T29 timing/failure diagnostics redact unknown fields and network strings', () => {
  const failure = { failureClass: 'network', networkCode: 'SECRET hostname', elapsedMs: 99, raw: 'SECRET' };
  const report = createDiagnosticReport({ voiceOutput: { outputMs: 7, historyWaitMs: 2, totalMs: 276, destination: 'active-window', ok: true, targetWindow: 'SECRET', body: 'SECRET' }, conversation: { pipeline: { context: { lastFailure: failure, timings: { modelHttpAttempts: 2, modelRetries: 1 } } } } });
  assert.equal(report.voiceOutput.outputMs, 7);
  assert.equal(report.conversation.pipeline.context.lastFailure.networkCode, 'unknown');
  assert.equal(report.conversation.pipeline.context.timings.modelHttpAttempts, 2);
  assert.doesNotMatch(JSON.stringify(report), /SECRET/);
});
