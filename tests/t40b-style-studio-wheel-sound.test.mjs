import test from 'node:test';
import assert from 'node:assert/strict';
import { createStyleStudioDetentSound, STYLE_STUDIO_DETENT_SOUND } from '../src/domain/styleStudioDetentSound.js';
import { StyleStudioWheelRouter, styleStudioWheelStep } from '../src/domain/styleStudioWheel.js';
import { createStyleStudioMotionSound, STYLE_STUDIO_MOTION_SOUND } from '../src/domain/styleStudioMotionSound.js';

test('T40B detent sound is short, quiet, original synthesis and tears down its context', async () => {
  const parameters = [];
  const oscillators = [];
  let instance;
  class FakeAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 2; this.destination = {}; this.resumes = 0; this.closed = 0; instance = this; }
    async resume() { this.resumes += 1; this.state = 'running'; }
    async close() { this.closed += 1; this.state = 'closed'; }
    createGain() { const gain = { events: [], setValueAtTime(value, at) { this.events.push(['set', value, at]); }, exponentialRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); } }; parameters.push(gain); return { gain, connect() {} }; }
    createOscillator() { const frequency = { events: [], setValueAtTime(value, at) { this.events.push(['set', value, at]); }, exponentialRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); } }; const node = { frequency, type: '', connect() {}, startAt: null, stopAt: null, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } }; oscillators.push(node); return node; }
  }
  const sound = createStyleStudioDetentSound({ AudioContextClass: FakeAudioContext });
  assert.equal(await sound.play(1), true);
  assert.equal(instance.resumes, 1);
  assert.equal(oscillators.length, 2);
  assert.equal(oscillators[0].frequency.events[0][1], STYLE_STUDIO_DETENT_SOUND.forwardHz);
  assert.ok(oscillators[0].stopAt - oscillators[0].startAt <= 0.06);
  assert.ok(parameters[0].events.some(event => event[1] === STYLE_STUDIO_DETENT_SOUND.maxGain));
  assert.ok(STYLE_STUDIO_DETENT_SOUND.maxGain <= 0.04);
  await sound.close();
  assert.equal(instance.closed, 1);
  assert.equal(await sound.play(-1), false);
});

test('T40B whole-page coarse wheel routing deduplicates Raw Input and legacy wheel events', () => {
  let clock = 1_000;
  const timers = new Map();
  const moves = [];
  const router = new StyleStudioWheelRouter(step => moves.push(step), {
    now: () => clock,
    setTimer: fn => { const id = {}; timers.set(id, fn); return id; },
    clearTimer: id => timers.delete(id),
  });
  router.accept(1, 'dom');
  clock += 20;
  router.accept(1, 'native');
  assert.deepEqual(moves, [1]);
  assert.equal(timers.size, 0);
  clock += 300;
  router.accept(-1, 'dom');
  for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
  assert.deepEqual(moves, [1, -1]);
  router.reset();
});

test('T40B wheel classifier reserves fine touchpad movement for page scrolling', () => {
  assert.equal(styleStudioWheelStep({ deltaY: 120, deltaMode: 0 }), 1);
  assert.equal(styleStudioWheelStep({ deltaY: -120, deltaMode: 0 }), -1);
  assert.equal(styleStudioWheelStep({ deltaX: 90, deltaY: 4, deltaMode: 0 }), 1);
  assert.equal(styleStudioWheelStep({ deltaY: 12, deltaMode: 0 }), 0);
  assert.equal(styleStudioWheelStep({ deltaY: 1, deltaMode: 1 }), 1);
});

test('T41 insert and pull feedback is short original synthesis with a shared bounded gain', async () => {
  const oscillators = [];
  let instance;
  class FakeAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 4; this.destination = {}; this.closed = 0; instance = this; }
    async resume() { this.state = 'running'; }
    async close() { this.closed += 1; this.state = 'closed'; }
    createGain() { const gain = { events: [], setValueAtTime(value, at) { this.events.push(['set', value, at]); }, exponentialRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); } }; return { gain, connect() {} }; }
    createOscillator() { const frequency = { events: [], setValueAtTime(value, at) { this.events.push(['set', value, at]); }, exponentialRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); } }; const node = { frequency, connect() {}, startAt: null, stopAt: null, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; } }; oscillators.push(node); return node; }
  }
  const sound = createStyleStudioMotionSound({ AudioContextClass: FakeAudioContext });
  assert.equal(await sound.play('insert'), true);
  assert.equal(await sound.play('pull'), true);
  assert.equal(oscillators.length, 4);
  assert.ok(STYLE_STUDIO_MOTION_SOUND.insertDurationSeconds <= 0.12);
  assert.ok(STYLE_STUDIO_MOTION_SOUND.pullDurationSeconds <= 0.09);
  assert.ok(STYLE_STUDIO_MOTION_SOUND.maxGain <= 0.04);
  await sound.close();
  assert.equal(instance.closed, 1);
  assert.equal(await sound.play('pull'), false);
});
