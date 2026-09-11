export const COMMON_SCENE_ACTIONS = Object.freeze([
  Object.freeze({ id: 'select-all', label: '全选', shortcut: 'Ctrl+A' }),
  Object.freeze({ id: 'copy', label: '复制', shortcut: 'Ctrl+C' }),
  Object.freeze({ id: 'paste', label: '粘贴', shortcut: 'Ctrl+V' }),
  Object.freeze({ id: 'undo', label: '撤销', shortcut: 'Ctrl+Z' }),
  Object.freeze({ id: 'save', label: '保存', shortcut: 'Ctrl+S' }),
]);

export function sceneBindingMode(binding) {
  if (binding?.type !== 'hotkey') return binding?.type || 'disabled';
  const common = COMMON_SCENE_ACTIONS.find(item => item.shortcut === binding.value && item.label === binding.label);
  return common?.id || 'hotkey';
}

export function sceneBindingForMode(mode) {
  const common = COMMON_SCENE_ACTIONS.find(item => item.id === mode);
  if (common) return { type: 'hotkey', label: common.label, value: common.shortcut };
  if (mode === 'hotkey') return { type: 'hotkey', label: '快捷键', value: 'Ctrl+Z' };
  if (mode === 'prompt') return { type: 'prompt', label: '复制提示词', value: '' };
  if (mode === 'app') return { type: 'app', label: '打开应用', value: '', appActionId: '', appName: '' };
  return { type: 'disabled', label: '禁用', value: '' };
}
