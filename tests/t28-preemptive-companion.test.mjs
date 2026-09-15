import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createDiagnosticReport } from '../src/services/diagnostics.js';
const require = createRequire(import.meta.url);
const { OpenAiStreamingCompanionModelAdapter } = require('../electron/companion-model-adapter.cjs');
const { ThreeStageCompanionProvider } = require('../electron/three-stage-companion-provider.cjs');
const { CompanionDialogueContext } = require('../electron/companion-dialogue-context.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = text => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });
const config = { provider: 'custom', endpoint: 'https://model.example/chat', apiKey: 'synthetic-test-key', model: 'test-model' };

function fixture({ bypass = () => false, fetchImpl, readMemoryContext } = {}) {
  let at = 1000, serial = 0, emitAsr;
  const timers = new Map(), requests = [], events = [], spoken = [];
  const now = () => at;
  const context = new CompanionDialogueContext({ now });
  const model = new OpenAiStreamingCompanionModelAdapter({ config, maxRetries: 0, now, dialogueContext: context, readMemoryContext,
    readKnowledgeContext: () => { throw new Error('speculation must never query remote'); },
    fetchImpl: fetchImpl || ((_url, options) => new Promise(resolve => requests.push({ options, resolve }))),
  });
  const provider = new ThreeStageCompanionProvider({ preemptive: true, now, shouldBypassModel: bypass,
    schedule: (callback, delay) => { const id = ++serial; timers.set(id, { callback, at: at + delay }); return id; },
    cancelSchedule: id => timers.delete(id),
    asrFactory: ({ onEvent }) => { emitAsr = onEvent; return { connect: async () => {}, sendAudio: () => true, close() {} }; },
    modelFactory: () => model,
    ttsFactory: () => ({ connect: async () => {}, synthesize: async (text, { onAudio }) => { spoken.push(text); onAudio(Buffer.from([0, 1])); }, interrupt() {}, close() {} }),
    onEvent: event => events.push(event),
  });
  return { model, provider, context, requests, events, spoken, timers,
    emit: event => emitAsr(event),
    partial: (text, itemId = 'one') => emitAsr({ type: 'partial', itemId, text }),
    final: (text, itemId = 'one') => emitAsr({ type: 'final', itemId, text }),
    advance: async ms => {
      at += ms;
      for (const [id, item] of [...timers]) if (item.at <= at && timers.delete(id)) item.callback();
      await tick();
    },
  };
}

test('T28 fast draft stays silent/private; final reuses it once and records confirmed spelling', async () => {
  const f = fixture(); await f.provider.connect();
  f.partial('讲一个有趣的故事'); await f.advance(499); assert.equal(f.requests.length, 0);
  await f.advance(1); assert.equal(f.requests.length, 1);
  f.requests[0].resolve(response('从前有一只小猫。')); await tick();
  assert.deepEqual(f.context.messages(), []);
  assert.deepEqual(f.spoken, []);
  assert.equal(f.events.some(e => ['chat.partial', 'chat.final', 'audio', 'asr.final'].includes(e.type)), false);
  await f.advance(1000); f.final('讲一个有趣的故事。'); await tick(); await tick();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.spoken, ['从前有一只小猫。']);
  assert.deepEqual(f.context.messages().map(e => e.content), ['讲一个有趣的故事。', '从前有一只小猫。']);
  assert.equal(f.events.filter(e => e.type === 'asr.final').length, 1);
  assert.equal(f.provider.diagnostics().counters.draftsReused, 1);
  const timing = f.provider.diagnostics().turnHistory[0].timing;
  assert.equal(timing.modelRequestStartedMs, 500);
  assert.equal(timing.asrFinalMs, 1500);
  assert.equal(timing.playbackStartedMs, null);
  f.provider.close();
});

test('T28 resumed speech cancels prior draft; late network result cannot speak or write context', async () => {
  const f = fixture(); await f.provider.connect();
  f.partial('讲一个有趣的故事'); await f.advance(500);
  f.partial('讲一个有趣的故事，不要有小猫');
  assert.equal(f.requests[0].options.signal.aborted, true);
  await f.advance(500);
  f.requests[0].resolve(response('错误的旧故事。')); await tick();
  f.requests[1].resolve(response('从前有一只小狗。')); await tick();
  assert.deepEqual(f.context.messages(), []);
  f.final('讲一个有趣的故事，不要有小猫'); await tick(); await tick();
  assert.deepEqual(f.spoken, ['从前有一只小狗。']);
  assert.equal(f.context.messages()[0].content.includes('不要'), true);
  assert.equal(JSON.stringify(f.context.messages()).includes('错误的旧故事'), false);
  f.provider.close();
});

test('T28 internal decimal and negation changes cannot reuse a normalized draft', async () => {
  for (const finalText of ['请解释一下15这个数', '请不要解释1.5这个数']) {
    const f = fixture(); await f.provider.connect();
    f.partial('请解释一下1.5这个数'); await f.advance(500);
    f.requests[0].resolve(response('旧答复。')); await tick();
    f.final(finalText); await tick();
    assert.equal(f.requests.length, 2);
    assert.equal(f.provider.diagnostics().counters.draftsReused, 0);
    f.requests[1].resolve(response('确认后的答复。')); await tick(); await tick();
    assert.deepEqual(f.spoken, ['确认后的答复。']);
    assert.equal(f.context.messages()[0].content, finalText);
    f.provider.close();
  }
});

test('T28 final can adopt an in-flight draft and continue deltas without replaying the prefix', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetchImpl: async () => ({ ok: true, body: { async *[Symbol.asyncIterator]() {
    yield Buffer.from('data: {"choices":[{"delta":{"content":"第一句。"}}]}\n\n');
    await gate;
    yield Buffer.from('data: {"choices":[{"delta":{"content":"第二句。"}}]}\n\n');
  } } }) });
  await f.provider.connect(); f.partial('给我说两句话吧'); await f.advance(500);
  assert.deepEqual(f.spoken, []);
  f.final('给我说两句话吧'); await tick();
  assert.deepEqual(f.spoken, ['第一句。']);
  release(); await tick(); await tick();
  assert.deepEqual(f.spoken, ['第一句。', '第二句。']);
  assert.equal(f.context.messages().at(-1).content, '第一句。第二句。');
  f.provider.close();
});

test('T28 changed dialogue or corrected reviewed memory rejects a private snapshot', async () => {
  for (const kind of ['context', 'reviewed']) {
    let reviewed = [];
    const f = fixture({ readMemoryContext: () => reviewed }); await f.provider.connect();
    f.partial('给我推荐一种早餐'); await f.advance(500);
    f.requests[0].resolve(response('旧资料答复。')); await tick();
    if (kind === 'context') f.context.append('user', '这是一条刚添加的更正');
    else reviewed = [{ content: '用户明确更正了资料' }];
    f.final('给我推荐一种早餐'); await tick();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve(response('按新资料回答。')); await tick(); await tick();
    assert.deepEqual(f.spoken, ['按新资料回答。']);
    assert.equal(JSON.stringify(f.context.messages()).includes('旧资料答复'), false);
    f.provider.close();
  }
});

test('T28 trusted/history/filler candidates do not start model or remote requests', async () => {
  const f = fixture({ bypass: text => text.includes('跳个舞') }); await f.provider.connect();
  for (const text of ['请你给我跳个舞吧', '帮我查KnowledgeOS知识库', '昨天我做了什么工作', '继续刚才的故事', '掌声', '嗯']) {
    f.partial(text); await f.advance(500);
  }
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.context.messages(), []);
  f.provider.close();
});

test('T28 long revision train is bounded and close discards timers and late model work', async () => {
  const f = fixture(); await f.provider.connect();
  for (let i = 0; i < 7; i++) { f.partial(`请介绍第${i}种宇宙现象`); await f.advance(500); }
  assert.equal(f.requests.length, 3);
  assert.equal(f.provider.diagnostics().counters.draftsStarted, 3);
  f.provider.close();
  for (const request of f.requests) request.resolve(response('不应播报的草稿。'));
  await tick(); await tick();
  assert.deepEqual(f.spoken, []);
  assert.deepEqual(f.context.messages(), []);
  assert.equal(f.timers.size, 0);
  const pending = fixture(); await pending.provider.connect(); pending.partial('这份候选还没启动');
  pending.provider.close(); await pending.advance(1000); assert.equal(pending.requests.length, 0);
});

test('T28 model HTTP and transport failures have safe classes, no raw response body', async () => {
  for (const [status, expected, recoverable] of [[429, 'rate-limit', true], [503, 'server', true], [401, 'authentication', false], [400, 'request', false], [0, 'network', true]]) {
    const adapter = new OpenAiStreamingCompanionModelAdapter({ config, fetchImpl: async () => {
      if (!status) throw new TypeError('secret host/path should not escape');
      return { ok: false, status, json: () => { throw new Error('must not read error body'); } };
    } });
    await assert.rejects(adapter.streamTurn({ text: '你好' }), error => {
      assert.equal(error.message, 'three-stage-model-unavailable');
      assert.equal(error.failure.failureClass, expected);
      assert.equal(error.recoverable, recoverable); return true;
    });
    assert.equal(adapter.diagnostics().lastFailure.failureClass, expected);
    assert.equal(JSON.stringify(adapter.diagnostics()).includes('secret'), false);
    adapter.close();
  }
});

test('T28 timeout is distinguished from user cancellation', async () => {
  const adapter = new OpenAiStreamingCompanionModelAdapter({ config, timeoutMs: 1000, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('raw upstream failure')), { once: true });
  }) });
  await assert.rejects(adapter.streamTurn({ text: '测试超时' }), error => error.failure.failureClass === 'timeout' && error.recoverable);
  const controller = new AbortController();
  const pending = adapter.streamTurn({ text: '测试取消', signal: controller.signal }); await tick(); controller.abort();
  await assert.rejects(pending, /three-stage-model-cancelled/);
  assert.equal(adapter.diagnostics().lastFailure, null);
  adapter.close();
});

test('T28 model failure before speech keeps provider ready and preceding successful timings', async () => {
  let calls = 0;
  const f = fixture({ fetchImpl: async () => ++calls === 2 ? { ok: false, status: 503 } : response('正常回复。') });
  await f.provider.connect(); f.final('第一轮正常问候'); await tick(); await tick(); f.provider.playbackDrained();
  f.final('第二轮模型故障', 'two'); await tick(); await tick();
  assert.equal(f.events.some(e => e.type === 'turn.failed'), true);
  assert.equal(f.events.some(e => e.type === 'error'), false);
  assert.equal(f.provider.sendAudio(Buffer.from([1, 2])), true);
  const history = f.provider.diagnostics().turnHistory;
  assert.deepEqual(history.map(r => r.outcome), ['completed', 'failed']);
  assert.equal(history[0].timing.firstTtsAudioMs, 0);
  assert.equal(history[1].failure.httpStatus, 503);
  assert.equal(history[1].timing.firstTtsAudioMs, null);
  f.final('第三轮恢复问候', 'three'); await tick(); await tick();
  assert.deepEqual(f.spoken, ['正常回复。', '正常回复。']);
  f.provider.close();
});

test('T49 consistent completed speech during model computation cancels it; clap and partial alone cannot', async () => {
  const f = fixture(); await f.provider.connect();
  f.final('讲一个有趣的故事'); await tick();
  f.emit({ type: 'speech.started', itemId: 'clap', audioStartMs: 0 });
  f.emit({ type: 'speech.stopped', itemId: 'clap', audioEndMs: 100 });
  f.final('掌声', 'clap');
  assert.equal(f.requests[0].options.signal.aborted, false);
  f.emit({ type: 'speech.started', itemId: 'correction', audioStartMs: 200 });
  await f.advance(650);
  f.partial('不要讲小猫', 'correction');
  f.partial('不要讲小猫要讲小狗', 'correction');
  assert.equal(f.requests[0].options.signal.aborted, false);
  f.emit({ type: 'speech.stopped', itemId: 'correction', audioEndMs: 1100 });
  f.final('不要讲小猫要讲小狗', 'correction'); await tick();
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(f.requests.length, 2);
  const body = JSON.parse(f.requests[1].options.body);
  assert.deepEqual(body.messages.filter(row => row.role === 'user').map(row => row.content), ['讲一个有趣的故事', '不要讲小猫要讲小狗']);
  f.requests[0].resolve(response('旧的小猫故事。'));
  f.requests[1].resolve(response('从前有一只小狗。')); await tick(); await tick();
  assert.deepEqual(f.spoken, ['从前有一只小狗。']);
  assert.deepEqual(f.provider.diagnostics().turnHistory.map(row => row.outcome), ['cancelled', 'completed']);
  f.provider.close();
});

test('T28 provider history evicts old measurements and direct speech does not inherit model timing', async () => {
  const f = fixture({ fetchImpl: async () => response('正常回复。') }); await f.provider.connect();
  for (let index = 0; index < 24; index++) {
    f.final(`普通聊天第${index}轮`); await tick(); await tick(); f.provider.playbackDrained();
  }
  assert.equal(f.provider.diagnostics().turnHistory.length, 20);
  assert.equal(f.provider.speakText('在的。'), true); await tick(); await tick();
  const row = f.provider.diagnostics().turnHistory.at(-1);
  assert.equal(row.kind, 'direct');
  assert.deepEqual(row.modelTiming, {});
  assert.equal(row.timing.modelRequestStartedMs, null);
  f.provider.close();
});

test('T28 diagnostic history is bounded and strictly redacted', () => {
  const poisoned = { outcome: 'completed', kind: 'model', text: 'SECRET', path: 'SECRET', timing: { asrFinalMs: 500, playbackStartedMs: null, text: 'SECRET' }, modelTiming: { modelFirstDeltaMs: 800, endpoint: 'SECRET' }, failure: { failureClass: 'server', httpStatus: 503, elapsedMs: 900, body: 'SECRET' } };
  const report = createDiagnosticReport({ conversation: { pipeline: { version: 1, provider: 'three-stage', preemptiveEnabled: true, turnHistory: Array(30).fill(poisoned), counters: { draftsReused: 2 }, context: { lastFailure: poisoned.failure } } } });
  const pipeline = report.conversation.pipeline;
  assert.equal(pipeline.turnHistory.length, 20);
  assert.equal(pipeline.turnHistory[0].modelTiming.modelFirstDeltaMs, 800);
  assert.equal(pipeline.turnHistory[0].timing.playbackStartedMs, null);
  assert.equal(pipeline.speculation.draftsReused, 2);
  assert.equal(JSON.stringify(report).includes('SECRET'), false);
});
