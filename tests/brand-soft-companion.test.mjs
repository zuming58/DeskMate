import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { companionVisualExpression, softCompanionClosed } from '../src/domain/companionVisual.js';

test('software companion appearance ignores task, error and old manual expression state', () => {
  for (const state of [undefined, 'idle', 'working', 'waiting', 'error', 'unknown']) assert.equal(companionVisualExpression(state), 'focus');
  for (const state of ['connecting', 'listening']) assert.equal(companionVisualExpression(state), 'listen');
  assert.equal(companionVisualExpression('speaking'), 'focus');
  assert.equal(companionVisualExpression('thinking'), 'think');
  assert.equal(companionVisualExpression('completed'), 'happy');
  assert.equal(companionVisualExpression('stopping'), 'sleep');
  for (const state of ['focus', 'listen', 'think', 'sad', 'alert']) {
    assert.equal(softCompanionClosed(state), false);
    assert.equal(softCompanionClosed(state, true), true);
  }
  assert.equal(softCompanionClosed('sleep'), true);
  assert.equal(softCompanionClosed('happy'), true);
});

test('new brand PNG and nine-size ICO carry RGBA imagery, not stale robot assets', () => {
  const png = fs.readFileSync('public/assets/branding/deskmate-logo.png');
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'RGBA source with real transparency');
  const ico = fs.readFileSync('electron/assets/deskmate-dm.ico');
  const sizes = [16,20,24,32,40,48,64,128,256];
  assert.equal(ico.readUInt16LE(4), sizes.length);
  let end = 6 + 16 * sizes.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    assert.equal(ico[entry] || 256, size);
    assert.equal(ico[entry + 1] || 256, size);
    const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal(offset, end);
    assert(ico.subarray(offset, offset + 8).equals(png.subarray(0, 8)));
    assert.equal(ico.readUInt32BE(offset + 16), size);
    assert.equal(ico[offset + 25], 6);
    end = offset + length;
  });
  assert.equal(end, ico.length);
  for (const frame of ['open', 'closed']) {
    const image = fs.readFileSync(`public/assets/expressions/soft/${frame}.png`);
    assert.equal(image.readUInt32BE(16), 768);
    assert.equal(image.readUInt32BE(20), 768);
  }
});

test('brand and friendly companion have distinct consumers without touching legacy expression assets', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const pages = fs.readFileSync('src/pages.jsx', 'utf8');
  const dashboard = fs.readFileSync('src/WorkbenchDashboard.jsx', 'utf8');
  const face = fs.readFileSync('src/CompanionFace.jsx', 'utf8');
  assert.match(app, /brand-mark.*<BrandLogo/);
  assert.match(dashboard, /<BrandLogo/);
  assert.doesNotMatch(dashboard, /CompanionFace/);
  assert.match(app, /device-card__screen.*appearance="soft"/);
  assert.match(pages, /companion-stage__face.*<CompanionPortrait/);
  assert.match(face, /motion\?\.addEventListener\?\.\('change', restart\)/);
  assert.match(face, /visibilitychange/);
  assert.match(face, /soft-face-open/);
  assert.match(face, /soft-face-closed/);
  for (const name of ['idle', 'blink', 'happy', 'sad', 'angry', 'thinking', 'listening']) assert(fs.existsSync(`public/assets/expressions/${name}.png`));
});
