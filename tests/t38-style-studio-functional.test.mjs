import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { StyleStudioStore, SOURCE_LIMIT, sniffImage } = require('../electron/style-studio-store.cjs');
const { buildImageRequest, endpointForImageWorkspace, generateQwenImage, validateResultUrl } = require('../electron/qwen-image-adapter.cjs');
const { StyleStudioService } = require('../electron/style-studio-service.cjs');
const { StyleStudioInputLease } = require('../electron/style-studio-input-lease.cjs');
const { STYLE_STUDIO_PRESETS, buildStyleStudioPrompt } = require('../electron/style-studio-presets.cjs');

function png(width = 32, height = 24, tail = '') {
  const bytes = Buffer.alloc(24 + Buffer.byteLength(tail));
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  bytes.write(tail, 24);
  return bytes;
}

test('T38 frozen presets match renderer ids and bound user input', async () => {
  const renderer = await import('../src/domain/styleStudio.js');
  assert.deepEqual(Object.keys(STYLE_STUDIO_PRESETS), renderer.STUDIO_STYLES.map(item => item.id));
  const value = buildStyleStudioPrompt('paper', 105, '  keep\u0000 face  ');
  assert.equal(value.strength, 100);
  assert.equal(value.brief, 'keep face');
  assert.match(value.prompt, /100\/100/);
  assert.throws(() => buildStyleStudioPrompt('unknown', 50), /style-studio-style-invalid/);
});

test('T38 media store deduplicates sources, persists results and detects tampering', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-style-store-'));
  try {
    const store = new StyleStudioStore({ userDataPath: directory, now: () => new Date('2026-09-14T10:00:00.000Z'), randomId: (() => { let i = 0; return () => `00000000-0000-4000-8000-${String(++i).padStart(12,'0')}`; })() });
    const first = store.importSource({ name: 'portrait', mime: 'image/png', bytes: png() });
    const duplicate = store.importSource({ name: 'renamed', mime: 'image/png', bytes: png() });
    assert.equal(first.created, true); assert.equal(duplicate.created, false); assert.equal(first.record.id, duplicate.record.id);
    const result = store.addResult({ sourceId: first.record.id, styleId: 'paper', styleName: '纸间光影', strength: 65, brief: '', mime: 'image/png', bytes: png(64,64,'result') });
    assert.equal(store.list().items.length, 2);
    assert.deepEqual(store.read(result.id, 'result').bytes, png(64,64,'result'));
    const index = JSON.parse(fs.readFileSync(path.join(directory, 'style-studio', 'library.json'), 'utf8'));
    const item = index.items.find(entry => entry.id === result.id);
    fs.appendFileSync(path.join(directory, 'style-studio', 'assets', item.file), 'tamper');
    assert.throws(() => store.read(result.id), /style-studio-asset-corrupt/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('T38 image store validates signature, MIME, pixels and source byte limit', () => {
  assert.deepEqual(sniffImage(png(8,9)), { mime: 'image/png', width: 8, height: 9 });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-style-limits-'));
  try {
    const store = new StyleStudioStore({ userDataPath: directory });
    assert.throws(() => store.importSource({ name: 'bad', mime: 'image/jpeg', bytes: png() }), /type-mismatch/);
    assert.throws(() => store.importSource({ name: 'pixels', mime: 'image/png', bytes: png(10000,10000) }), /pixels-too-large/);
    assert.throws(() => store.importSource({ name: 'large', mime: 'image/png', bytes: Buffer.concat([png(), Buffer.alloc(SOURCE_LIMIT)]) }), /too-large/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('T38 media store protects linked sources and deletes managed files explicitly', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-style-remove-'));
  try {
    const store = new StyleStudioStore({ userDataPath: directory });
    const source = store.importSource({ name: 'portrait', mime: 'image/png', bytes: png() }).record;
    const result = store.addResult({ sourceId: source.id, styleId: 'paper', styleName: '纸间光影', strength: 65, brief: '', mime: 'image/png', bytes: png(64,64,'made') });
    const indexPath = path.join(directory, 'style-studio', 'library.json');
    const assetPath = id => {
      const item = JSON.parse(fs.readFileSync(indexPath, 'utf8')).items.find(entry => entry.id === id);
      return path.join(directory, 'style-studio', 'assets', item.file);
    };
    const sourcePath = assetPath(source.id); const resultPath = assetPath(result.id);
    assert.throws(() => store.remove(source.id), /style-studio-source-in-use/);
    assert.equal(fs.existsSync(sourcePath), true); assert.equal(fs.existsSync(resultPath), true);
    assert.equal(store.remove(result.id).removed.id, result.id); assert.equal(fs.existsSync(resultPath), false);
    assert.equal(store.remove(source.id).removed.id, source.id); assert.equal(fs.existsSync(sourcePath), false);
    assert.deepEqual(store.list().items, []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('T38 Qwen adapter keeps credentials in headers and downloads the temporary result immediately', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: true, status: 200, headers: { get: name => name === 'x-request-id' ? 'req-123' : '' }, json: async () => ({ data: [{ url: 'https://dashscope-result.oss-cn-beijing.aliyuncs.com/output.png?token=secret' }], usage: { output_width: 1024, output_height: 1024 } }) };
    return { ok: true, status: 200, url: String(url), headers: { get: name => name === 'content-type' ? 'image/png' : name === 'content-length' ? String(png(64,64).length) : '' }, arrayBuffer: async () => png(64,64) };
  };
  const value = await generateQwenImage({ apiKey: 'sk-12345678', workspaceId: 'workspace-123', sourceBytes: png(), sourceMime: 'image/png', prompt: 'paper artwork', fetchImpl });
  assert.match(calls[0].url, /workspace-123.*\/images\/generations$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-12345678');
  assert.doesNotMatch(calls[0].options.body, /sk-12345678/);
  assert.equal(JSON.parse(calls[0].options.body).model, 'qwen-image-3.0');
  assert.equal(calls.length, 2); assert.equal(value.requestId, 'req-123'); assert.equal(value.mime, 'image/png');
  assert.match(buildImageRequest({ sourceBytes: png(), sourceMime: 'image/png', prompt: 'x' }).image, /^data:image\/png;base64,/);
  assert.match(endpointForImageWorkspace(''), /dashscope\.aliyuncs\.com/);
  assert.throws(() => validateResultUrl('http://127.0.0.1/private'), /result-url-invalid/);
});

test('T38 service requires explicit consent, freezes a managed source and stores success', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-style-service-'));
  try {
    const store = new StyleStudioStore({ userDataPath: directory });
    const source = store.importSource({ name: 'portrait', mime: 'image/png', bytes: png() }).record;
    let generated;
    const service = new StyleStudioService({ store, credentialStore: { status: () => ({ configured: true }), loadSecret: () => ({ apiKey: 'sk-12345678', baseUrl: 'https://metajing.cn/v1' }) }, generate: async value => { generated = value; return { bytes: png(64,64,'made'), mime: 'image/png', requestId: 'provider-1', usage: {} }; } });
    await assert.rejects(service.generate({ requestId: 'studio-12345678', sourceId: source.id, styleId: 'paper', strength: 65 }), /consent-required/);
    const result = await service.generate({ requestId: 'studio-12345678', sourceId: source.id, styleId: 'paper', strength: 65, brief: 'keep face', consent: true });
    assert.equal(result.ok, true); assert.equal(result.record.sourceId, source.id); assert.match(generated.prompt, /keep face/); assert.equal(generated.baseUrl, 'https://metajing.cn/v1'); assert.equal(service.status().active, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('T38 service cancellation aborts the active provider request without creating a result', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-style-cancel-'));
  try {
    const store = new StyleStudioStore({ userDataPath: directory });
    const source = store.importSource({ name: 'portrait', mime: 'image/png', bytes: png() }).record;
    const service = new StyleStudioService({ store, credentialStore: { status: () => ({ configured: true }), loadSecret: () => ({ apiKey: 'sk-12345678', baseUrl: 'https://metajing.cn/v1' }) }, generate: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('image2-cancelled')), { once: true })) });
    const pending = service.generate({ requestId: 'studio-cancel-1', sourceId: source.id, styleId: 'paper', strength: 65, consent: true });
    assert.deepEqual(service.cancel('studio-cancel-1'), { ok: true });
    await assert.rejects(pending, /image2-cancelled/);
    assert.equal(store.list().items.filter(item => item.kind === 'result').length, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('T38 input lease only routes the foreground Studio wheel and two proven raw triggers', () => {
  let foreground = true; const events = [];
  const lease = new StyleStudioInputLease({ isForeground: () => foreground, publish: value => events.push(value) });
  lease.acquire('studio-12345678');
  assert.equal(lease.routeWheel({ action: 'positive' }), true);
  assert.equal(lease.routeTrigger({ key: 'VoiceInput' }), true);
  assert.equal(lease.routeTrigger({ key: 'VoiceEdit' }), true);
  assert.deepEqual(events.map(item => item.command), ['next','strength','save']);
  foreground = false; assert.equal(lease.routeWheel({ action: 'negative' }), false);
  foreground = true; lease.release('studio-12345678'); assert.equal(lease.routeTrigger({ key: 'VoiceInput' }), false);
});
