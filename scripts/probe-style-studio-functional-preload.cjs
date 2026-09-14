const { contextBridge } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/assets/style-studio/source.png'));
const result = fs.readFileSync(path.join(root, 'public/assets/style-studio/paper.png'));
const state = { acquired: 0, released: 0, generated: [], removed: [] };
const sourceRecord = { id: 'source-0123456789abcdef01234567', kind: 'source', name: '我的本地照片', mime: 'image/png', size: source.length, width: 1024, height: 1024, createdAt: '2026-09-14T10:00:00.000Z' };

contextBridge.exposeInMainWorld('desktopBridge', {
  getStyleStudioStatus: async () => ({ ok: true, configured: true, active: false, provider: '百炼 · 千问图像 3.0', model: 'qwen-image-3.0', library: { ok: true, revision: 1, items: [sourceRecord] } }),
  readStyleStudioMedia: async ({ id }) => id === sourceRecord.id ? { ok: true, record: sourceRecord, bytes: new Uint8Array(source) } : { ok: false, reason: 'missing' },
  importStyleStudioSource: async () => ({ ok: false, reason: 'probe-import-disabled' }),
  removeStyleStudioMedia: async ({ id }) => { state.removed.push(id); return { ok: true, removed: { id }, revision: 3 }; },
  generateStyleStudioImage: async value => { state.generated.push(value); await new Promise(resolve => setTimeout(resolve, 120)); return { ok: true, record: { id: 'result-01234567-89ab-4cde-8123-0123456789ab', kind: 'result', name: '纸间光影', mime: 'image/png', size: result.length, sourceId: sourceRecord.id, styleId: value.styleId, styleName: '纸间光影', strength: value.strength, brief: value.brief, createdAt: '2026-09-14T10:01:00.000Z' }, bytes: new Uint8Array(result), requestId: 'probe-provider' }; },
  cancelStyleStudioImage: async () => ({ ok: true }),
  acquireStyleStudioInput: async () => { state.acquired++; return { ok: true, active: true }; },
  releaseStyleStudioInput: async () => { state.released++; return { ok: true, active: false }; },
  onStyleStudioInput: () => () => {},
});
contextBridge.exposeInMainWorld('__styleProbe', { state: () => JSON.parse(JSON.stringify(state)) });
