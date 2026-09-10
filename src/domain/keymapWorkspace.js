import { normalizeEncoder, normalizeKeyBinding } from './keymap.js';

export const SHARED_KEY_INDEXES = [0, 1, 2, 3, 7];
export const SCENE_KEY_INDEXES = [4, 5, 6];
export const sceneRouteBinding = index => ({ action: `prompt-key-${index + 1}` });

// One-time local migration of the known pre-workbench layout, not a device write.
// Explicit pending edits and later custom assignments remain the user's choices.
export function prepareCompanionPromptKeys(state) {
  if (state.keyboardLayoutVersion >= 1) return null;
  const keys = state.keymap;
  const pending = normalizeKeyboardPending(state.keyboardPending);
  const oldFourth = keys?.[3]?.action === 'companion-call' || (keys?.[3]?.action === 'hotkey' && keys[3].shortcut === 'Backspace');
  if (keys?.[2]?.action !== 'voice-edit' || !oldFourth || pending.keymap.KEY3 || pending.keymap.KEY4) return { keyboardLayoutVersion: 1 };
  const updates = { KEY3: { action: 'companion-call' }, KEY4: { action: 'prompt-key-4' } };
  return { keyboardLayoutVersion: 1, keyboardPending: { ...pending, keymap: { ...pending.keymap, ...updates } },
    keymap: keys.map((binding, index) => updates[`KEY${index + 1}`] || binding) };
}

// Pending global edits survive navigation/restarts and readback, without claiming board sync.
export function normalizeKeyboardPending(value) {
  const keymap = Object.fromEntries(SHARED_KEY_INDEXES.filter(i => value?.keymap?.[`KEY${i + 1}`]).map(i => [`KEY${i + 1}`, normalizeKeyBinding(value.keymap[`KEY${i + 1}`])]));
  const normalized = normalizeEncoder(value?.encoder);
  const encoder = Object.fromEntries(Object.keys(normalized).filter(key => Object.hasOwn(value?.encoder || {}, key)).map(key => [key, normalized[key]]));
  return { keymap, encoder };
}

export function projectKeyboardRead(config, pending) {
  const changes = normalizeKeyboardPending(pending);
  return { keymap: config.keymap.map((binding, i) => changes.keymap[`KEY${i + 1}`] || normalizeKeyBinding(binding)), encoder: normalizeEncoder({ ...config.encoder, ...changes.encoder }) };
}

export function workspaceKeyboardPatch(pending, bindings) {
  const changes = normalizeKeyboardPending(pending);
  // Only the reserved route is written for 5–7. Scene text/chords stay local.
  for (const i of SCENE_KEY_INDEXES) if (bindings[i]?.action !== sceneRouteBinding(i).action) changes.keymap[`KEY${i + 1}`] = sceneRouteBinding(i);
  return { ...(Object.keys(changes.keymap).length ? { keymap: changes.keymap } : {}), ...(Object.keys(changes.encoder).length ? { encoder: changes.encoder } : {}) };
}
