import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { companionVideoState, createCompanionVideoPlayer } from '../src/domain/companionVideo.js';
import { createComputerCompanionAudioEngine } from '../src/domain/computerCompanionAudio.js';
import { defaultState, reduceAppState, serializeConfig } from '../src/store/appStore.js';

test('playback runtime slice is accepted by the real store and never persisted/exported', () => {
  const next = reduceAppState(defaultState, { type: 'runtime-slice', slice: 'companionPlayback', value: { playing: true } });
  assert.equal(next.runtime.companionPlayback.playing, true);
  assert.equal(defaultState.runtime.companionPlayback.playing, false);
  assert(!JSON.stringify(serializeConfig(next)).includes('companionPlayback'));
});

function fixture() {
  const timers = new Map(); let id = 0;
  const videos = [0, 1].map(() => ({ style: {}, src: '', paused: true, frames: [], duration: 15, currentTime: 0,
    removeAttribute() { this.src = ''; }, load() {}, pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); }, requestVideoFrameCallback(fn) { this.frames.push(fn); } }));
  const status = [];
  const player = createCompanionVideoPlayer({ videos, baseUrl: '/clips', onStatus: v => status.push(v), schedule: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, cancel: id => timers.delete(id) });
  const ready = async index => { videos[index].onloadeddata?.(); await Promise.resolve(); videos[index].frames.splice(0).forEach(fn => fn()); };
  const run = ms => { for (const [key, item] of [...timers]) if (item.ms === ms) { timers.delete(key); item.fn(); } };
  return { videos, player, status, ready, run, timers };
}

test('video states distinguish listening, generation and real speaker playback', () => {
  assert.equal(companionVideoState(), 'idle');
  assert.equal(companionVideoState({ active: true, state: 'listening' }), 'listen');
  for (const state of ['thinking', 'speaking']) assert.equal(companionVideoState({ active: true, state }), 'think');
  assert.equal(companionVideoState({ active: true, state: 'speaking' }, true), 'speak');
  assert.equal(companionVideoState({ active: false }, true), 'speak', 'temporary announcement follows the same actual sink');
  assert.equal(companionVideoState({ active: false, state: 'speaking' }), 'idle');
});
test('hidden video does no loading; reveal only decoded frame; old decoder released after fade', async () => {
  const f = fixture(); f.player.setState('listen');
  assert(f.videos.every(v => !v.src));
  f.player.setVisible(true); assert.equal(f.videos[0].src, '/clips/listen.mp4');
  assert.equal(f.videos[0].style.opacity, '0'); await f.ready(0);
  assert.equal(f.videos[0].style.opacity, '1');
  f.player.setState('think'); assert.equal(f.videos[0].style.opacity, '1');
  await f.ready(1); assert.equal(f.videos[1].style.opacity, '1'); f.run(180);
  assert.equal(f.videos[0].src, ''); assert.equal(f.videos[0].paused, true);
  f.player.setVisible(false); assert(f.videos.every(v => !v.src && v.paused)); assert.equal(f.timers.size, 0);
  f.player.setState('speak'); assert(f.videos.every(v => !v.src)); f.player.dispose();
});
test('interruption pauses mouth immediately, ignores late frames, and supports quick A-B-A', async () => {
  const f = fixture(); f.player.setState('speak'); f.player.setVisible(true); await f.ready(0);
  f.player.setState('listen'); assert(f.videos[0].paused); assert.equal(f.videos[0].style.opacity, '0');
  f.videos[1].onloadeddata(); await Promise.resolve(); const stale = f.videos[1].frames.shift();
  f.player.setState('speak'); stale(); assert.equal(f.status.length, 1);
  await f.ready(1); assert.equal(f.status.at(-1).state, 'speak'); assert.equal(f.videos[1].paused, false);
  f.player.dispose(); assert.equal(f.timers.size, 0);
});
test('same-state loop seam crossfades; errors and decode timeout keep poster and allow retry', async () => {
  const f = fixture(); f.player.setVisible(true); await f.ready(0);
  f.videos[0].currentTime = 14.8; f.videos[0].ontimeupdate();
  assert.equal(f.videos[1].src, '/clips/idle.mp4'); await f.ready(1); f.run(180);
  assert.equal(f.videos[0].src, '');
  f.player.setState('think'); f.videos[0].onerror(); assert.equal(f.status.at(-1).error, true);
  assert(f.videos.every(v => !v.src)); f.player.retry(); await f.ready(0); assert.equal(f.status.at(-1).error, false);
  f.player.setState('listen'); f.run(4000); assert.equal(f.status.at(-1).error, true);
  f.player.dispose();
});
test('late load/play rejection after hidden/disposal cannot start or show a video', async () => {
  const f = fixture(); f.player.setVisible(true); const loaded = f.videos[0].onloadeddata;
  f.player.setVisible(false); loaded(); await Promise.resolve(); assert.equal(f.status.length, 0);
  f.player.setVisible(true); f.videos[0].play = () => Promise.reject(new Error('blocked'));
  f.videos[0].onloadeddata(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.status.at(-1).error, true); f.player.dispose();
});
test('four provenance-checked videos and neutral poster are bundled, not user paths or online URLs', () => {
  const dir = 'public/assets/companion/home-video/';
  const manifest = JSON.parse(fs.readFileSync(dir + 'manifest.json', 'utf8').replace(/^\uFEFF/, ''));
  assert.deepEqual(manifest.clips.map(c => c.state), ['idle', 'listen', 'think', 'speak']);
  for (const c of manifest.clips) {
    const bytes = fs.readFileSync(dir + c.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), c.sha256);
    assert.equal(c.audio, false); assert.equal(c.width / c.height, 4 / 3); assert(c.duration > 14.9 && c.duration < 15.1);
    assert(c.bytes < c.sourceBytes / 2); assert(bytes.includes(Buffer.from('avc1'))); assert(!bytes.includes(Buffer.from('soun')));
    assert.equal(fs.readFileSync('dist/client/assets/companion/home-video/' + c.file).compare(bytes), 0);
  }
  assert(fs.statSync(dir + 'poster.jpg').size > 1000);
  const component = fs.readFileSync('src/CompanionPortrait.jsx', 'utf8');
  assert.equal((component.match(/<video /g) || []).length, 2);
  assert(!/Downloads|https:|file:|getUserMedia|AudioContext/.test(component));
  assert.match(component, /preload="none"/);
});
test('audio visual observer follows real queued PCM, ends/interrupt/suspend, rejects stale data and cannot break audio', async () => {
  const contexts = [], nodes = [], changes = [];
  class Audio {
    constructor() { this.state = 'running'; this.currentTime = 1; this.destination = {}; contexts.push(this); }
    async resume() {} async close() { this.state = 'closed'; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createBuffer(_c, n, rate) { return { duration: n / rate, getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { const node = { connect() {}, start() {}, stop() {}, onended: null }; nodes.push(node); return node; }
  }
  const engine = createComputerCompanionAudioEngine({ AudioContextClass: Audio, onPlaybackChange: playing => { changes.push(playing); throw new Error('visual failure'); } });
  const base = { version: 1, sessionId: 'test', generation: 1 };
  await engine.handleCommand({ ...base, type: 'sink.start' }); assert.deepEqual(changes, []);
  const pcm = sequence => ({ ...base, type: 'sink.audio', sequence, audio: new Int16Array(2400).buffer });
  await engine.handleCommand({ ...pcm(1), sessionId: 'stale' }); assert.deepEqual(changes, []);
  await engine.handleCommand(pcm(1)); await engine.handleCommand(pcm(2)); assert.deepEqual(changes, [true]);
  nodes[0].onended(); assert.deepEqual(changes, [true]);
  contexts[0].state = 'suspended'; contexts[0].onstatechange(); assert.deepEqual(changes, [true, false]);
  contexts[0].state = 'running'; contexts[0].onstatechange(); nodes[1].onended(); assert.deepEqual(changes, [true, false, true, false]);
  await engine.handleCommand(pcm(3)); await engine.handleCommand({ ...base, type: 'sink.interrupt' }); assert.deepEqual(changes.slice(-2), [true, false]);
  await engine.close(); assert.equal(contexts[0].onstatechange, null);
});
