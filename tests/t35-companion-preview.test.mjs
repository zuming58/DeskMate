import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('home preview has two equal 3:2 frames and separate small alpha sidebar assets', () => {
  for (const name of ['open','blink']) {
    const data = fs.readFileSync(`public/assets/companion/home-desk/${name}.png`);
    assert.equal(data.readUInt32BE(16), 1152);
    assert.equal(data.readUInt32BE(20), 768);
  }
  for (const name of ['open','closed']) {
    const data = fs.readFileSync(`public/assets/expressions/soft/transparent-${name}.png`);
    assert.equal(data.readUInt32BE(16), 256);
    assert.equal(data.readUInt32BE(20), 256);
    assert.equal(data[25], 6, 'real alpha-capable PNG');
  }
});

test('portrait animation has visibility, reduced motion, asset failure and timer cleanup boundaries', () => {
  const source = fs.readFileSync('src/CompanionPortrait.jsx','utf8');
  for (const value of ['document.hidden', 'IntersectionObserver', 'prefers-reduced-motion', 'createCompanionVideoPlayer', 'onError', 'controller.dispose()', 'observer?.disconnect()', '非实时口型']) assert(source.includes(value), value);
  assert.doesNotMatch(source, /fetch\(|getUserMedia|AudioContext|desktopApi|window\.electron/);
  const css = fs.readFileSync('src/styles.css','utf8');
  assert.match(css, /companion-portrait__eyelids \{[^}]*clip-path:/);
});

test('sidebar has transparent face and only actual device connection caption', () => {
  const app = fs.readFileSync('src/App.jsx','utf8');
  const card = app.slice(app.indexOf('<div className="device-card">'), app.indexOf('</aside>'));
  assert.match(card, /appearance="soft" transparent/);
  assert.match(card, /boardConnected \? "EasyInput 已连接" : "EasyInput 未连接"/);
  assert.doesNotMatch(card, /<small|USB HID|F22|监听|就绪/);
  const css = fs.readFileSync('src/styles.css','utf8');
  assert.match(css, /\.device-card \{[^}]*border: 1px solid #3b4655;[^}]*border-radius: 16px;[^}]*background: #2d3541;/);
  assert.doesNotMatch(fs.readFileSync('src/CompanionPortrait.jsx','utf8'), /blink\.png|allowBlink/);
});
