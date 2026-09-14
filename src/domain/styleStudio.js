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
].map(style => ({ ...style, image: asset(style.id) }));
export const STUDIO_EFFECTS = ['原图 / 作品', '彩色点阵', '像素切片', '字符诗篇', '双色印记', '线条回声'];
export const wrapStudioIndex = (value, length = STUDIO_STYLES.length) => ((value % length) + length) % length;
export const clampStudioStrength = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
export function studioPrompt(style, strength, brief = '') {
  return `Preserve the recognizable subject and composition. ${style.prompt}\nCreative transformation level: ${clampStudioStrength(strength)}/100.\n${brief.trim() ? `Creative brief: ${brief.trim()}\n` : ''}Output artwork only. No application interface, border, watermark or labels.`;
}
export function studioOrbit(index, cursor) {
  const distance = wrapStudioIndex(index - cursor);
  const angle = (-180 + distance * 40) * Math.PI / 180;
  return {
    x: Math.cos(angle) * 205,
    y: Math.sin(angle) * 180,
    scale: 1 - distance * .095,
    opacity: 1 - distance * .16,
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
export function studioKey(event) {
  if (event.isComposing || event.altKey || event.metaKey || event.shiftKey) return null;
  if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return null;
  if (event.code === 'Enter' && event.target?.closest?.('button,a')) return null;
  if (event.ctrlKey) return ({ KeyA: 'compare', KeyC: 'inspiration', KeyV: 'reset', KeyZ: 'mode' })[event.code] || null;
  const key = event.code;
  if (event.repeat && !['ArrowLeft', 'ArrowRight'].includes(key)) return null;
  return ({ ArrowLeft: 'previous', ArrowRight: 'next', Enter: 'confirm', Backspace: 'close', Digit1: 'strength', Digit2: 'view', Digit3: 'save', Digit4: 'close', Digit5: 'compare', Digit6: 'inspiration', Digit7: 'reset', Digit8: 'mode', Escape: 'close' })[key] || null;
}
export function validStudioUpload(file) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024;
}
