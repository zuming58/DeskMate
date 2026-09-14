import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { STUDIO_STYLES, wrapStudioIndex, clampStudioStrength, studioPrompt, studioOrbit, studioKey, validStudioUpload } from '../src/domain/styleStudio.js';
test('T37 five provenance-backed styles and bounded intensity', () => {
  assert.equal(STUDIO_STYLES.length, 5);
  for (const s of STUDIO_STYLES) assert(fs.existsSync(new URL(`../public/assets/style-studio/${s.id}.png`, import.meta.url)));
  assert.equal(wrapStudioIndex(-1), 4); assert.equal(wrapStudioIndex(10001), 1);
  assert.equal(clampStudioStrength(-2), 0); assert.equal(clampStudioStrength(111), 100); assert.equal(clampStudioStrength(NaN), 0);
  assert.match(studioPrompt(STUDIO_STYLES[0], 65, 'keep face'), /65\/100.*\nCreative brief: keep face/);
});
test('T37 all generated raster hashes match the source manifest', () => {
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/style-studio/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.files.length,7);
  for(const file of manifest.files) assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../public/assets/style-studio/'+file.file,import.meta.url))).digest('hex').toUpperCase(),file.sha256);
});
test('T37 orbital positions are unique, bounded and cycle', () => {
  const positions = STUDIO_STYLES.map((_,i) => studioOrbit(i,0));
  assert.equal(new Set(positions.map(p=>p.x)).size, 5);
  assert.equal(positions[0].scale, 1);
  for (const p of positions) { assert(Math.abs(p.x)<=235); assert(Math.abs(p.y)<=255); assert(p.scale>.4); }
  assert.deepEqual(studioOrbit(0,0), studioOrbit(0,5));
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
  const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
  assert.match(main,/--show-style-studio/);
  assert.match(main,/hash: '\/style-studio'/);
});
