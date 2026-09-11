const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const packagedFile = (file) => asar.extractFile(archive, path.normalize(file));
const bundled = JSON.parse(packagedFile('electron/prompt-library.json'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'electron/prompt-library.json'), 'utf8'));
assert.deepEqual(bundled, source, 'packaged prompt data must match source including all original bodies');
assert.equal(bundled.prompts.length, 80);
assert.equal(bundled.primaryScenes.find(scene => scene.id === 'scene-video')?.title, '多媒体制作');
assert.equal(bundled.prompts.filter(prompt => prompt.primarySceneId === 'scene-video').length, 26);
const main = packagedFile('electron/main.cjs').toString('utf8');
assert(main.includes('t26f-scene-shortcut-capture'));
assert(main.includes('--show-prompts'));
for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/agent-state-hid.cjs', 'electron/xiaozhi-hardware-policy.cjs', 'electron/prompt-wheel-router.cjs', 'electron/prompt-workbench.cjs', 'electron/prompt-workbench-controller.cjs', 'electron/input-bridge.cjs', 'electron/input-bridge-protocol.cjs', 'electron/codex-hook-state.cjs', 'electron/codex-hook-integration.cjs', 'electron/codex-app-server-catalog.cjs', 'electron/codex-task-brief.cjs', 'electron/companion-memory.cjs', 'electron/companion-memory-policy.cjs', 'electron/companion-model-adapter.cjs', 'electron/knowledge-base-projection.cjs', 'electron/knowledgeos-settings.cjs', 'electron/knowledgeos-mcp-client.cjs', 'electron/memory-journal-service.cjs']) {
  assert(packagedFile(file).equals(fs.readFileSync(path.join(root, file))), `stale package: ${file}`);
}
assert(packagedFile('electron/codex-hook-state.cjs').toString('utf8').includes('Codex 临时任务'));
assert(packagedFile('electron/prompt-workbench.cjs').toString().includes("require('./prompt-library.json')"));
assert(packagedFile('electron/preload.cjs').toString().includes('prompts:command'));
assert(packagedFile('electron/workbench-overview.cjs').equals(fs.readFileSync(path.join(root, 'electron/workbench-overview.cjs'))));
assert(main.includes('workbench:get-overview'));
assert(packagedFile('dist/client/index.html').equals(fs.readFileSync(path.join(root, 'dist/client/index.html'))));
assert(fs.readFileSync(path.join(root, 'release/win-unpacked/resources/input-bridge/DeskMate.InputBridge.exe')).equals(fs.readFileSync(path.join(root, 'native/DeskMate.InputBridge/publish/DeskMate.InputBridge.exe'))));
for (const file of ['assets/branding/deskmate-logo.png', 'assets/expressions/soft/open.png', 'assets/expressions/soft/closed.png']) {
  assert(packagedFile(`dist/client/${file}`).equals(fs.readFileSync(path.join(root, 'public', file))), `stale brand asset: ${file}`);
}
for (const filename of ['deskmate-dm.ico', 'deskmate-dm.png']) {
  assert(fs.readFileSync(path.join(root, 'release/win-unpacked/resources/app-assets', filename)).equals(fs.readFileSync(path.join(root, 'electron/assets', filename))));
}
console.log('T26F packaged resource check passed: captured scene shortcuts, multimedia prompt scene, voice motion priority, separate mouse/board wheel polarity, safe Codex project labels, DM branding, live workbench, 80 prompts and native bridge.');
