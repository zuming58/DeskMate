import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildImage2Request, generateImage2, image2Endpoint, validateResultUrl } = require('../electron/image2-adapter.cjs');
const { createSecureImage2Store, normalizeImage2BaseUrl } = require('../electron/secure-image2.cjs');
const { StyleStudioJournal } = require('../electron/style-studio-journal.cjs');
const { publicError } = require('../electron/style-studio-service.cjs');

function png(width = 32, height = 24, tail = '') {
  const bytes = Buffer.alloc(24 + Buffer.byteLength(tail));
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  bytes.write(tail, 24);
  return bytes;
}

function jsonResponse(value, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    ok: true,
    status: 200,
    headers: { get: name => headers[String(name).toLowerCase()] || (name === 'content-length' ? String(bytes.length) : '') },
    arrayBuffer: async () => bytes,
  };
}

test('T40 Image 2 request is fixed to the audited compatible contract', () => {
  const request = buildImage2Request({ sourceBytes: png(), sourceMime: 'image/png', prompt: 'paper artwork' });
  assert.equal(request.model, 'gpt-image-2');
  assert.equal(request.size, '1024x1024');
  assert.equal(request.n, 1);
  assert.equal(request.response_format, 'url');
  assert.equal(request.quality, 'standard');
  assert.equal(request.output_format, 'png');
  assert.match(request.images[0], /^data:image\/png;base64,/);
  assert.equal(image2Endpoint('https://metajing.cn/v1/images/generations'), 'https://metajing.cn/v1/images/generations');
  assert.equal(normalizeImage2BaseUrl('https://metajing.cn/v1/'), 'https://metajing.cn/v1');
  assert.throws(() => normalizeImage2BaseUrl('http://example.com/v1'), /HTTPS/);
  assert.throws(() => validateResultUrl('http://127.0.0.1/private'), /image2-result-url-invalid/);
});

test('T40 Image 2 adapter sends the key only in the header and accepts URL output', async () => {
  const calls = [];
  const output = png(64, 64, 'made');
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return jsonResponse({ id: 'job-123', data: [{ url: 'https://cdn.example.test/result.png?signature=temporary' }] }, { 'x-request-id': 'req-123' });
    return { ok: true, status: 200, url: String(url), headers: { get: name => name === 'content-type' ? 'image/png' : name === 'content-length' ? String(output.length) : '' }, arrayBuffer: async () => output };
  };
  const value = await generateImage2({ apiKey: 'relay-secret-123', baseUrl: 'https://metajing.cn/v1', sourceBytes: png(), sourceMime: 'image/png', prompt: 'paper artwork', fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://metajing.cn/v1/images/generations');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer relay-secret-123');
  assert.doesNotMatch(calls[0].options.body, /relay-secret-123/);
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(value.requestId, 'req-123');
  assert.equal(value.mime, 'image/png');
  assert.deepEqual(value.bytes, output);
});

test('T40 Image 2 adapter accepts bounded base64 output and never retries uncertain submission', async () => {
  let calls = 0;
  const output = png(72, 72, 'base64');
  const value = await generateImage2({
    apiKey: 'relay-secret-123', baseUrl: 'https://metajing.cn/v1', sourceBytes: png(), sourceMime: 'image/png', prompt: 'ink artwork',
    fetchImpl: async () => { calls++; return jsonResponse({ data: [{ b64_json: output.toString('base64') }] }); },
  });
  assert.equal(calls, 1);
  assert.deepEqual(value.bytes, output);
  calls = 0;
  await assert.rejects(generateImage2({
    apiKey: 'relay-secret-123', baseUrl: 'https://metajing.cn/v1', sourceBytes: png(), sourceMime: 'image/png', prompt: 'ink artwork',
    fetchImpl: async () => { calls++; throw new Error('socket reset after submit'); },
  }), /image2-submission-uncertain/);
  assert.equal(calls, 1);
  assert.match(publicError(new Error('image2-submission-uncertain')), /没有自动重试/);
});

test('T40 Image 2 credentials are encrypted at rest and status never exposes the key', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-image2-secret-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, ''),
  };
  try {
    const store = createSecureImage2Store({ safeStorage, userDataPath: directory });
    const status = store.save({ apiKey: 'relay-secret-123', baseUrl: 'https://metajing.cn/v1/' });
    assert.deepEqual(status, { configured: true, provider: 'metajing', baseUrl: 'https://metajing.cn/v1', model: 'gpt-image-2', timeoutSeconds: 1200, storage: 'windows-encrypted' });
    assert.equal('apiKey' in status, false);
    const persisted = fs.readFileSync(path.join(directory, 'image2-credentials.json'), 'utf8');
    assert.doesNotMatch(persisted, /relay-secret-123/);
    assert.equal(store.loadSecret().apiKey, 'relay-secret-123');
    assert.equal(store.clear().configured, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('T40 generation journal is bounded and excludes images, prompts and secrets', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-image2-journal-'));
  try {
    let tick = 0;
    const journal = new StyleStudioJournal({ userDataPath: directory, now: () => new Date(Date.UTC(2026, 8, 14, 0, 0, tick++)) });
    for (let index = 0; index < 25; index++) {
      const id = `studio-${String(index).padStart(8, '0')}`;
      journal.start({ id, styleId: 'paper', provider: 'metajing', model: 'gpt-image-2', prompt: 'must-not-persist', apiKey: 'must-not-persist' });
      journal.finish(id, 'succeeded', { providerRequestId: `provider-${index}` });
    }
    const raw = fs.readFileSync(path.join(directory, 'style-studio', 'generation-journal.json'), 'utf8');
    const saved = JSON.parse(raw);
    assert.equal(saved.items.length, 20);
    assert.equal(saved.items.at(-1).state, 'succeeded');
    assert.doesNotMatch(raw, /must-not-persist|prompt|apiKey|sourceBytes|\"bytes\"/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
