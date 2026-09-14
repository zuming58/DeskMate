import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { STUDIO_STYLES, STUDIO_EFFECTS, STUDIO_EFFECT_PARAMETERS, wrapStudioIndex, clampStudioStrength, clampStudioRadius, clampStudioDetail, studioPrompt, studioOrbit, studioScatter, clampStudioPosition, studioKey, validStudioUpload } from '../src/domain/styleStudio.js';
test('T41 ten provenance-backed styles and bounded generation/reveal controls', () => {
  assert.equal(STUDIO_STYLES.length, 10);
  for (const s of STUDIO_STYLES) assert(fs.existsSync(new URL(`../public/assets/style-studio/${s.id}.png`, import.meta.url)));
  assert.equal(STUDIO_STYLES.at(-1).id, 'blocks');
  assert.equal(wrapStudioIndex(-1), 9); assert.equal(wrapStudioIndex(10001), 1);
  assert.equal(clampStudioStrength(-2), 0); assert.equal(clampStudioStrength(111), 100); assert.equal(clampStudioStrength(NaN), 0);
  assert.equal(clampStudioRadius(4), 10); assert.equal(clampStudioRadius(102), 90);
  assert.equal(clampStudioDetail(-1), 10); assert.equal(clampStudioDetail(99), 90);
  assert.equal(STUDIO_EFFECTS.length, 6); assert.equal(STUDIO_EFFECT_PARAMETERS.length, 6);
  assert.match(studioPrompt(STUDIO_STYLES[0], 65, 'keep face'), /65\/100.*\nCreative brief: keep face/);
});
test('T37 all generated raster hashes match the source manifest', () => {
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/style-studio/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.files.length,12);
  for(const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../public/assets/style-studio/'+file.file,import.meta.url))).digest('hex').toUpperCase(),file.sha256);
});
test('T37 orbital positions are unique, bounded and cycle', () => {
  const positions = STUDIO_STYLES.map((_,i) => studioOrbit(i,0));
  assert.equal(new Set(positions.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size, 10);
  assert.equal(positions[0].scale, 1); assert.equal(positions[0].opacity, 1);
  for (const p of positions) { assert(Math.abs(p.x)<=205); assert(Math.abs(p.y)<=180); assert(p.scale>=.5); assert(p.opacity>=.24); }
  assert.deepEqual(studioOrbit(0,0), studioOrbit(0,10));
});
test('T39 free canvases have deterministic bounded scatter and clamp dropped cards', () => {
  assert.notDeepEqual(studioScatter(0, 'material'), studioScatter(1, 'material'));
  assert.notDeepEqual(studioScatter(0, 'material'), studioScatter(0, 'result'));
  assert.deepEqual(clampStudioPosition({ x: -20, y: 110, tilt: 30 }), { x: 7, y: 82, tilt: 12 });
  for (let i = 0; i < 30; i++) for (const zone of ['material','result']) {
    const point = studioScatter(i, zone); assert(point.x >= 7 && point.x <= 93); assert(point.y >= 18 && point.y <= 82); assert(point.tilt >= -12 && point.tilt <= 12);
  }
});
test('T38 page keyboard preserves editors and maps the existing Maker chords only on the page', () => {
  assert.equal(studioKey({code:'Digit1'}), 'strength');
  assert.equal(studioKey({code:'ArrowLeft',repeat:true}), 'previous');
  assert.equal(studioKey({code:'Digit3',repeat:true}), null);
  assert.equal(studioKey({code:'Enter',ctrlKey:true}), null);
  assert.equal(studioKey({code:'Backspace'}), 'close');
  assert.equal(studioKey({code:'KeyA',ctrlKey:true}), 'compare');
  assert.equal(studioKey({code:'KeyC',ctrlKey:true}), 'inspiration');
  assert.equal(studioKey({code:'KeyV',ctrlKey:true}), 'reset');
  assert.equal(studioKey({code:'KeyZ',ctrlKey:true}), 'mode');
  assert.equal(studioKey({code:'Digit1',isComposing:true}), null);
  assert.equal(studioKey({code:'Digit1',target:{closest:()=>true}}), null);
  assert.equal(studioKey({code:'F22'}), null);
});
test('T37 upload types and limits exclude SVG, executables and empty files', () => {
  assert(validStudioUpload({type:'image/png',size:1024}));
  assert(!validStudioUpload({type:'image/svg+xml',size:100}));
  assert(!validStudioUpload({type:'image/png',size:11*1024*1024}));
  assert(!validStudioUpload({type:'image/jpeg',size:0}));
});
test('T37 navigation adds one route after Companion and CSS stays scoped', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(app, /id: "companion"[^\n]+\n\s*\{ id: "style-studio"/);
  const css=fs.readFileSync(new URL('../src/style-studio.css',import.meta.url),'utf8');
  assert(!/^[.#]?(sidebar|device-card|app-header|body|:root)\s*\{/m.test(css));
  const source=fs.readFileSync(new URL('../src/StyleStudioPage.jsx',import.meta.url),'utf8');
  assert.match(source,/getStyleStudioStatus/);
  assert.doesNotMatch(source,/setShortcutCapture|setGlobalShortcutsEnabled/);
  assert.match(source,/确认上传并生成/);
  assert.match(source,/离开或失焦自动恢复/);
  assert.match(source,/clearTimeout\(timer.current\)/);
  assert.match(source,/素材自由摆放区/);
  assert.match(source,/作品自由摆放区/);
  assert.match(source,/作品出片口/);
  assert.match(source,/Image 2 正在显影/);
  assert.match(source,/orbitOpen && !adjusting/);
  assert.match(source,/按“整理”可再次排齐/);
  assert.match(source,/styleStudioWheelStep/);
  assert.match(source,/createStyleStudioDetentSound/);
  assert.match(source,/createStyleStudioMotionSound/);
  assert.match(source,/dropIntoMachine/);
  assert.match(source,/beginEjectPull/);
  assert.match(source,/STUDIO_EFFECT_PARAMETERS/);
  assert.match(source,/并排对比原图/);
  assert.match(source,/passive: false, capture: true/);
  const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
  assert.match(main,/--show-style-studio/);
  assert.match(main,/hash: '\/style-studio'/);
});
