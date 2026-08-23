const MODIFIER_NAMES = new Map([
  ["ctrl", "Ctrl"],
  ["control", "Ctrl"],
  ["commandorcontrol", "CommandOrControl"],
  ["cmdorctrl", "CommandOrControl"],
  ["shift", "Shift"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["meta", "Super"],
  ["super", "Super"],
  ["command", "Super"],
  ["cmd", "Super"],
]);

const KEY_NAMES = new Map([
  ["space", "Space"],
  ["tab", "Tab"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["escape", "Esc"],
  ["esc", "Esc"],
]);

function normalizeShortcut(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 64) throw new Error("快捷键格式无效");
  const parts = value.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) throw new Error("全局快捷键至少需要一个修饰键");
  const keyPart = parts.pop();
  const modifiers = [];
  for (const part of parts) {
    const modifier = MODIFIER_NAMES.get(part.toLowerCase());
    if (!modifier || modifiers.includes(modifier)) throw new Error("快捷键修饰键无效或重复");
    modifiers.push(modifier);
  }
  const lowerKey = keyPart.toLowerCase();
  let key = KEY_NAMES.get(lowerKey);
  if (!key && /^[a-z0-9]$/i.test(keyPart)) key = keyPart.toUpperCase();
  if (!key && /^f(?:[1-9]|1\d|2[0-4])$/i.test(keyPart)) key = keyPart.toUpperCase();
  if (!key) throw new Error("快捷键按键无效");
  return [...modifiers, key].join("+");
}

module.exports = { normalizeShortcut };
