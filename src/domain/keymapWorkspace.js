import { normalizeEncoder, normalizeKeyBinding } from './keymap.js';

export const SHARED_KEY_INDEXES = [0, 1, 2, 3, 7];
export const SCENE_KEY_INDEXES = [4, 5, 6];
export const sceneRouteBinding = index => ({ action: `prompt-key-${index + 1}` });

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
