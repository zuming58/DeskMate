// UI-only slice. Preset examples are never represented as transforms of an upload.
const asset = name => `${import.meta.env?.BASE_URL || './'}assets/style-studio/${name}.png`;
export const STUDIO_SOURCE = asset('source');
export const STUDIO_DIAL = asset('dial');
export const STUDIO_STYLES = [
  { id: 'paper', name: '纸间光影', description: '将照片折叠成温柔的纸间世界。', prompt: 'Layered paper-cut sculpture, tactile paper fibers, cobalt and cream botanical layers, soft dimensional shadows.' },
  { id: 'yarn', name: '毛线手作', description: '把日常织进柔软的针脚里。', prompt: 'Hand-knitted wool miniature, visible soft yarn loops, cream and teal textiles, warm macro photography.' },
  { id: 'glass', name: '玻璃花房', description: '把一个小世界，轻轻装进玻璃。', prompt: 'Miniature glass terrarium, delicate moss and leaves, transparent glass dome, warm natural product photography.' },
  { id: 'clay', name: '黏土质感', description: '用手作的温度，重新捏出生活。', prompt: 'Handmade clay sculpture, matte tactile finish, subtle finger-made texture, warm apricot and cream palette.' },
  { id: 'pixel', name: '像素世界', description: '让熟悉的轮廓，进入方块宇宙。', prompt: 'Refined voxel miniature, cubic teal shapes, tiny block plants, warm cream background, clean isometric aesthetic.' },
  { id: 'ink', name: '水墨微景', description: '让熟悉的身影，落进一方安静山水。', prompt: 'Contemporary Chinese ink-wash miniature on warm xuan paper, expressive ink edges, restrained cobalt and celadon mineral pigments.' },
  { id: 'chrome', name: '液态银蓝', description: '把轮廓淬成克制、明亮的未来材质。', prompt: 'Pearlescent brushed chrome collectible with translucent cyan glass accents, restrained cobalt rim light, warm-white premium studio.' },
  { id: 'storybook', name: '绘本暖光', description: '用温暖笔触，重新画下日常片刻。', prompt: 'Premium hand-painted gouache picture-book illustration, colored-pencil edges, soft paper grain, celadon, cobalt and apricot palette.' },
  { id: 'jelly', name: '果冻软糖', description: '把熟悉的轮廓，变成清透软弹的糖果质感。', prompt: 'Translucent aqua jelly collectible, soft gummy material, subtle internal bubbles, rounded refraction, glossy cobalt highlights, warm-white tabletop.' },
  { id: 'blocks', name: '积木模型', description: '把熟悉的轮廓，搭成一件可以看见接缝的积木藏品。', prompt: 'Intricate interlocking toy-brick sculpture with visible studs and joints, glossy mint, cobalt and cream bricks, playful premium product photography.' },
].map(style => ({ ...style, image: asset(style.id) }));
export const STUDIO_EFFECTS = ['原图 / 作品', '彩色点阵', '像素切片', '字符诗篇', '双色印记', '线条回声'];
export const STUDIO_EFFECT_PARAMETERS = ['无颗粒', '点大小', '像素大小', '字符大小', '色阶大小', '线条间距'];
export const wrapStudioIndex = (value, length = STUDIO_STYLES.length) => ((value % length) + length) % length;
export const clampStudioStrength = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
export const clampStudioRadius = value => Math.max(10, Math.min(90, Math.round(Number(value) || 0)));
export const clampStudioDetail = value => Math.max(10, Math.min(90, Math.round(Number(value) || 0)));
export function studioPrompt(style, strength, brief = '') {
  return `Preserve the recognizable subject and composition. ${style.prompt}\nCreative transformation level: ${clampStudioStrength(strength)}/100.\n${brief.trim() ? `Creative brief: ${brief.trim()}\n` : ''}Output artwork only. No application interface, border, watermark or labels.`;
}
export function studioOrbit(index, cursor) {
  const distance = wrapStudioIndex(index - cursor);
  const angle = (-180 + distance * 40) * Math.PI / 180;
  return {
    x: Math.cos(angle) * 205,
    y: Math.sin(angle) * 180,
    scale: Math.max(.5, 1 - distance * .075),
    opacity: Math.max(.24, 1 - distance * .12),
    angle: -8 + distance * 4,
    z: 10 - distance,
  };
}
const STUDIO_SCATTER = {
  material: [
    { x: 10, y: 44, tilt: -8 }, { x: 70, y: 38, tilt: 5 }, { x: 86, y: 46, tilt: -3 },
    { x: 55, y: 55, tilt: 7 }, { x: 93, y: 65, tilt: 9 }, { x: 25, y: 62, tilt: 3 },
    { x: 79, y: 70, tilt: -7 }, { x: 42, y: 39, tilt: -4 }, { x: 63, y: 72, tilt: 4 },
  ],
  result: [
    { x: 20, y: 50, tilt: -7 }, { x: 42, y: 42, tilt: 4 }, { x: 64, y: 54, tilt: -3 },
    { x: 82, y: 45, tilt: 6 }, { x: 31, y: 64, tilt: 3 }, { x: 54, y: 68, tilt: -5 },
    { x: 74, y: 69, tilt: 4 }, { x: 91, y: 64, tilt: -6 },
  ],
};
export function studioScatter(index, zone = 'material') {
  const points = STUDIO_SCATTER[zone] || STUDIO_SCATTER.material;
  const point = points[wrapStudioIndex(index, points.length)];
  const lap = Math.floor(Math.max(0, index) / points.length);
  return { ...point, x: Math.max(7, Math.min(93, point.x - lap * 2)), y: Math.max(20, Math.min(80, point.y + lap * 3)) };
}
export function clampStudioPosition(value = {}) {
  return {
    x: Math.max(7, Math.min(93, Number(value.x) || 50)),
    y: Math.max(18, Math.min(82, Number(value.y) || 50)),
    tilt: Math.max(-12, Math.min(12, Number(value.tilt) || 0)),
  };
}
const STUDIO_PAGE_COMMANDS = ['strength', 'view', 'save', 'close', 'compare', 'inspiration', 'reset', 'mode'];
const KEYBOARD_ACTION_SHORTCUTS = { 'select-all': 'Ctrl+A', copy: 'Ctrl+C', paste: 'Ctrl+V', undo: 'Ctrl+Z', enter: 'Enter', backspace: 'Backspace' };
const SHORTCUT_CODES = { Return: 'Enter', Enter: 'Enter', Space: 'Space', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };
function matchesStudioBinding(event, binding) {
  const shortcut = binding?.action === 'hotkey' ? binding.shortcut : KEYBOARD_ACTION_SHORTCUTS[binding?.action];
  if (typeof shortcut !== 'string' || !shortcut) return false;
  const parts = shortcut.split('+');
  const key = parts.pop();
  const expectedCode = SHORTCUT_CODES[key] || (/^[A-Z]$/.test(key) ? `Key${key}` : /^[0-9]$/.test(key) ? `Digit${key}` : /^F(?:[1-9]|1[0-2])$/.test(key) ? key : '');
  return Boolean(expectedCode)
    && event.code === expectedCode
    && Boolean(event.ctrlKey) === parts.includes('Ctrl')
    && Boolean(event.altKey) === parts.includes('Alt')
    && Boolean(event.shiftKey) === parts.includes('Shift')
    && Boolean(event.metaKey) === parts.includes('Win');
}
export function studioKey(event, keymap) {
  if (event.isComposing) return null;
  if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return null;
  const key = event.code;
  if (event.repeat && !['ArrowLeft', 'ArrowRight'].includes(key)) return null;
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    const direct = ({ ArrowLeft: 'previous', ArrowRight: 'next', Escape: 'close' })[key];
    if (direct) return direct;
  }
  const hasKeymap = Array.isArray(keymap) && keymap.length === STUDIO_PAGE_COMMANDS.length;
  if (hasKeymap) {
    const matches = keymap.map((binding, index) => matchesStudioBinding(event, binding) ? STUDIO_PAGE_COMMANDS[index] : null).filter(Boolean);
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
    const direct = ({ Digit1: 'strength', Digit2: 'view', Digit3: 'save', Digit4: 'close', Digit5: 'compare', Digit6: 'inspiration', Digit7: 'reset', Digit8: 'mode' })[key];
    if (direct) return direct;
  }
  if (hasKeymap) return null;
  if (event.altKey || event.metaKey || event.shiftKey) return null;
  if (event.ctrlKey) return ({ KeyA: 'compare', KeyC: 'inspiration', KeyV: 'reset', KeyZ: 'mode' })[event.code] || null;
  return ({ Enter: 'view', Backspace: 'close' })[key] || null;
}
export function validStudioUpload(file) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024;
}
