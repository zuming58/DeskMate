const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const releaseDirectory = process.argv[2] || 'release';
assert(/^release(?:-[a-z0-9-]+)?$/.test(releaseDirectory), 'invalid release directory');
const archive = path.join(root, releaseDirectory, 'win-unpacked/resources/app.asar');
const packagedFile = (file) => asar.extractFile(archive, path.normalize(file));
const bundled = JSON.parse(packagedFile('electron/prompt-library.json'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'electron/prompt-library.json'), 'utf8'));
assert.deepEqual(bundled, source, 'packaged prompt data must match source including all original bodies');
assert.equal(bundled.prompts.length, 80);
assert.equal(bundled.primaryScenes.find(scene => scene.id === 'scene-video')?.title, '多媒体制作');
assert.equal(bundled.prompts.filter(prompt => prompt.primarySceneId === 'scene-video').length, 26);
const main = packagedFile('electron/main.cjs').toString('utf8');
assert(packagedFile('electron/memory-candidate-review.cjs').equals(fs.readFileSync(path.join(root, 'electron/memory-candidate-review.cjs'))));
for (const name of ['idle.mp4','listen.mp4','think.mp4','speak.mp4','poster.jpg','manifest.json']) {
  const file = `assets/companion/home-video/${name}`;
  assert(packagedFile(`dist/client/${file}`).equals(fs.readFileSync(path.join(root, 'public', file))), `stale companion video: ${name}`);
}
assert(main.includes('t72-community-release'));
for (const file of ['memory-curation.cjs', 'memory-curation-store.cjs']) assert(packagedFile(`electron/${file}`).equals(fs.readFileSync(path.join(root, 'electron', file))), `stale curation resource: ${file}`);
for (const file of ['clipboard-access.cjs', 'active-window-output.cjs', 'selection-capture.cjs']) {
  assert(packagedFile(`electron/${file}`).equals(fs.readFileSync(path.join(root, 'electron', file))), `stale clipboard resource: ${file}`);
}
assert(packagedFile('electron/atomic-private-json.cjs').equals(fs.readFileSync(path.join(root, 'electron/atomic-private-json.cjs'))));
for (const file of ['secure-ai-services.cjs', 'secure-bailian.cjs', 'secure-image2.cjs']) assert(packagedFile(`electron/${file}`).equals(fs.readFileSync(path.join(root, 'electron', file))));
for (const file of ['text-model-json.cjs', 'companion-memory-pipeline.cjs']) assert(packagedFile(`electron/${file}`).equals(fs.readFileSync(path.join(root, 'electron', file))), `stale memory resource: ${file}`);
for (const file of ['personal-reminders.cjs','preload.cjs']) assert(packagedFile(`electron/${file}`).equals(fs.readFileSync(path.join(root,'electron',file))), `stale reminder resource: ${file}`);
for (const file of ['local-retention.cjs','local-retention-service.cjs','local-retention-worker.cjs']) assert(packagedFile(`electron/${file}`).equals(fs.readFileSync(path.join(root,'electron',file))), `stale retention resource: ${file}`);
for (const file of ['electron/local-backup.cjs', 'electron/local-backup-worker.cjs', 'electron/local-backup-service.cjs', 'electron/restore-lifecycle.cjs']) assert(packagedFile(file).equals(fs.readFileSync(path.join(root, file))), `stale backup resource: ${file}`);
for (const name of ['store', 'worker', 'service']) {
  const file = `electron/local-history-${name}.cjs`;
  assert(packagedFile(file).equals(fs.readFileSync(path.join(root, file))), `stale local-history resource: ${file}`);
}
assert(main.includes('--show-prompts'));
for (const file of ['electron/main.cjs', 'electron/personal-reminders.cjs', 'electron/companion-model-transport.cjs', 'electron/companion-persona.cjs', 'electron/companion-intent-bridge.cjs', 'electron/voice-overlay-presenter.cjs', 'electron/overlay-preload.cjs', 'electron/three-stage-companion-provider.cjs', 'electron/companion-conversation.cjs', 'electron/preload.cjs', 'electron/agent-state-hid.cjs', 'electron/xiaozhi-hardware-policy.cjs', 'electron/prompt-wheel-router.cjs', 'electron/prompt-workbench.cjs', 'electron/prompt-workbench-controller.cjs', 'electron/input-bridge.cjs', 'electron/input-bridge-protocol.cjs', 'electron/codex-hook-state.cjs', 'electron/codex-hook-integration.cjs', 'electron/codex-app-server-catalog.cjs', 'electron/codex-task-brief.cjs', 'electron/companion-memory.cjs', 'electron/companion-memory-policy.cjs', 'electron/companion-model-adapter.cjs', 'electron/knowledge-base-projection.cjs', 'electron/knowledgeos-settings.cjs', 'electron/knowledgeos-mcp-client.cjs', 'electron/memory-journal-service.cjs', 'electron/style-studio-store.cjs', 'electron/style-studio-service.cjs', 'electron/style-studio-presets.cjs', 'electron/style-studio-input-lease.cjs', 'electron/style-studio-lease-hid.cjs', 'electron/qwen-image-adapter.cjs', 'electron/image2-adapter.cjs', 'electron/secure-image2.cjs', 'electron/style-studio-journal.cjs']) {
  assert(packagedFile(file).equals(fs.readFileSync(path.join(root, file))), `stale package: ${file}`);
}
assert(packagedFile('electron/codex-hook-state.cjs').toString('utf8').includes('Codex 临时任务'));
assert(packagedFile('electron/prompt-workbench.cjs').toString().includes("require('./prompt-library.json')"));
assert(packagedFile('electron/preload.cjs').toString().includes('prompts:command'));
assert(packagedFile('electron/preload.cjs').toString().includes('style-studio:generate'));
assert(packagedFile('electron/preload.cjs').toString().includes('style-studio:remove'));
assert(packagedFile('electron/workbench-overview.cjs').equals(fs.readFileSync(path.join(root, 'electron/workbench-overview.cjs'))));
for (const file of ['electron/dictation-text.cjs', 'electron/companion-dialogue-context.cjs', 'electron/companion-retrieval-policy.cjs', 'electron/companion-speech-segmenter.cjs', 'electron/companion-preferences.cjs', 'electron/three-stage-companion-provider.cjs', 'electron/companion-conversation.cjs']) assert(packagedFile(file).equals(fs.readFileSync(path.join(root, file))), `stale voice resource: ${file}`);
assert(main.includes('workbench:get-overview'));
assert(packagedFile('dist/client/index.html').equals(fs.readFileSync(path.join(root, 'dist/client/index.html'))));
for (const asset of fs.readdirSync(path.join(root, 'dist/client/assets'), { withFileTypes: true }).filter(entry => entry.isFile())) {
  const file = `dist/client/assets/${asset.name}`;
  assert(packagedFile(file).equals(fs.readFileSync(path.join(root, file))), `stale renderer asset: ${file}`);
}
const rendererText = fs.readdirSync(path.join(root, 'dist/client/assets')).filter(name => /^index-.*\.js$/.test(name)).map(name => fs.readFileSync(path.join(root, 'dist/client/assets', name), 'utf8')).join('\n');
for (const label of ['青绿好奇', '珊瑚开心', '钴蓝专注', '淡紫小憩', '本地素材']) assert(rendererText.includes(label), `missing Chinese Style Studio label: ${label}`);
assert(fs.readFileSync(path.join(root, releaseDirectory, 'win-unpacked/resources/input-bridge/DeskMate.InputBridge.exe')).equals(fs.readFileSync(path.join(root, 'native/DeskMate.InputBridge/publish/DeskMate.InputBridge.exe'))));
for (const file of ['assets/branding/deskmate-logo.png', 'assets/expressions/soft/open.png', 'assets/expressions/soft/closed.png', 'assets/expressions/soft/transparent-open.png', 'assets/expressions/soft/transparent-closed.png', 'assets/companion/home-desk/open.png', 'assets/companion/home-desk/blink.png']) {
  assert(packagedFile(`dist/client/${file}`).equals(fs.readFileSync(path.join(root, 'public', file))), `stale brand asset: ${file}`);
}
for (const filename of ['source.png', 'paper.png', 'yarn.png', 'glass.png', 'clay.png', 'pixel.png', 'ink.png', 'chrome.png', 'storybook.png', 'jelly.png', 'blocks.png', 'dial.png', 'manifest.json']) {
  const file = `assets/style-studio/${filename}`;
  assert(packagedFile(`dist/client/${file}`).equals(fs.readFileSync(path.join(root, 'public', file))), `stale style-studio asset: ${filename}`);
}
for (const filename of ['deskmate-dm.ico', 'deskmate-dm.png']) {
  assert(fs.readFileSync(path.join(root, releaseDirectory, 'win-unpacked/resources/app-assets', filename)).equals(fs.readFileSync(path.join(root, 'electron/assets', filename))));
}
console.log('T68 packaged resource check passed: async clipboard consumers, voice configuration recovery, hidden native menu, Style Studio, reminders, Workbench, backup/restore, renderer, companion videos and exact native bridge.');
