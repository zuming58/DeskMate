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
  const angle = (-135 + distance * 22.5) * Math.PI / 180;
  return { x: Math.cos(angle) * 240, y: Math.sin(angle) * 255, scale: distance === 0 ? 1 : .76 - distance * .065, angle: -9 + distance * 6, z: 10 - distance };
}
export function studioKey(event) {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return null;
  if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return null;
  if (event.code === 'Enter' && event.target?.closest?.('button,a')) return null;
  const key = event.code;
  if (event.repeat && !['ArrowLeft', 'ArrowRight'].includes(key)) return null;
  return ({ ArrowLeft: 'previous', ArrowRight: 'next', Enter: 'confirm', Digit1: 'strength', Digit2: 'view', Digit3: 'save', Digit4: 'close', Digit5: 'compare', Digit6: 'inspiration', Digit7: 'reset', Digit8: 'mode', Escape: 'close' })[key] || null;
}
export function validStudioUpload(file) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 15 * 1024 * 1024;
}
