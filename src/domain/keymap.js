import { shortcutDisplay } from "./shortcutCapture.js";
import { COMPANION_CALL_ACTION_ID } from "./companionPreferences.js";

export const KEY_ACTIONS = [
  { id: "voice-input", label: "语音输入" },
  { id: "voice-edit", label: "语音编辑" },
  { id: "select-all", label: "全选" },
  { id: "copy", label: "复制" },
  { id: "paste", label: "粘贴" },
  { id: "undo", label: "撤销" },
  { id: "hotkey", label: "快捷键" },
  { id: "fixed-text", label: "固定文字" },
  { id: "open-app", label: "打开应用" },
  { id: "companion-call", label: "AI 陪伴呼唤" },
  { id: "disabled", label: "禁用" },
];

export const ENCODER_PRESS_ACTIONS = [
  { id: "scroll-axis-toggle", label: "切换方向" },
  { id: "text-caret-select", label: "文字选择" },
  ...KEY_ACTIONS.filter((item) => item.id !== "companion-call"),
];

export const DEFAULT_KEYMAP = [
  { action: "voice-input" },
  { action: "hotkey", shortcut: "Return" },
  { action: "voice-edit" },
  { action: "hotkey", shortcut: "Backspace" },
  { action: "select-all" },
  { action: "copy" },
  { action: "paste" },
  { action: "undo" },
];

export const DEFAULT_ENCODER = {
  mode: "scroll",
  axis: "vertical",
  speed: 3,
  reverseVertical: false,
  reverseHorizontal: false,
  press: { action: "scroll-axis-toggle" },
};

const LEGACY_ACTIONS = new Map(KEY_ACTIONS.map((item) => [item.label, item.id]));
const ACTION_IDS = new Set([...KEY_ACTIONS.map((item) => item.id), "enter", "backspace"]);
const ENCODER_ACTION_IDS = new Set(ENCODER_PRESS_ACTIONS.map((item) => item.id));
const ALL_ACTION_IDS = new Set([...ACTION_IDS, ...ENCODER_ACTION_IDS]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIXED_TEXT_MAX_BYTES = 960;

export function limitUtf8Bytes(value, maxBytes = FIXED_TEXT_MAX_BYTES) {
  const source = typeof value === "string" ? value : "";
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of source) {
    const count = encoder.encode(character).length;
    if (bytes + count > maxBytes) break;
    result += character;
    bytes += count;
  }
  return result;
}

export function normalizeKeyBinding(value, fallback = { action: "disabled" }) {
  if (typeof value === "string") return { action: LEGACY_ACTIONS.get(value) || "disabled" };
  if (!value || typeof value !== "object" || Array.isArray(value) || !ALL_ACTION_IDS.has(value.action)) return { ...fallback };
  return {
    action: value.action,
    ...(typeof value.shortcut === "string" && value.shortcut ? { shortcut: value.shortcut.slice(0, 64) } : {}),
    ...(typeof value.text === "string" && value.text ? { text: limitUtf8Bytes(value.text) } : {}),
    ...(typeof value.appActionId === "string" && UUID_PATTERN.test(value.appActionId) ? { appActionId: value.appActionId } : {}),
    ...(typeof value.appName === "string" && value.appName ? { appName: value.appName.slice(0, 120) } : {}),
  };
}

export function normalizeEncoder(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const press = normalizeKeyBinding(source.press, DEFAULT_ENCODER.press);
  if (!ENCODER_ACTION_IDS.has(press.action)) press.action = DEFAULT_ENCODER.press.action;
  return {
    mode: ["scroll", "cursor"].includes(source.mode) ? source.mode : DEFAULT_ENCODER.mode,
    axis: ["vertical", "horizontal"].includes(source.axis) ? source.axis : DEFAULT_ENCODER.axis,
    speed: Math.max(1, Math.min(5, Number(source.speed) || DEFAULT_ENCODER.speed)),
    reverseVertical: Boolean(source.reverseVertical),
    reverseHorizontal: Boolean(source.reverseHorizontal),
    press,
  };
}

export function actionLabel(binding) {
  const value = normalizeKeyBinding(binding);
  if (value.action === "open-app" && value.appName) return value.appName;
  if (value.action === "hotkey" && value.shortcut) return shortcutDisplay(value.shortcut);
  if (value.action === "enter") return "回车";
  if (value.action === "backspace") return "退格";
  if (value.action === "fixed-text" && value.text) return value.text.length > 12 ? `${value.text.slice(0, 12)}…` : value.text;
  return KEY_ACTIONS.find((item) => item.id === value.action)?.label
    || ENCODER_PRESS_ACTIONS.find((item) => item.id === value.action)?.label
    || "禁用";
}

export function firmwareAction(binding) {
  const value = normalizeKeyBinding(binding);
  const named = {
    "voice-input": "voice_ptt_hold",
    "voice-edit": "edit_ptt_hold",
    "select-all": "select_all",
    copy: "copy",
    paste: "paste",
    undo: "undo",
    disabled: "disabled",
    "scroll-axis-toggle": "scroll_axis_toggle",
    "text-caret-select": "text_caret_select",
  };
  if (named[value.action]) return named[value.action];
  if (value.action === "enter") return { hotkey: "Return" };
  if (value.action === "backspace") return { hotkey: "Backspace" };
  if (value.action === "hotkey" && value.shortcut) return { hotkey: value.shortcut };
  if (value.action === "fixed-text" && value.text) return { text: value.text };
  if (value.action === "open-app" && value.appActionId) return `host_action:${value.appActionId}`;
  if (value.action === "companion-call") return `host_action:${COMPANION_CALL_ACTION_ID}`;
  throw new Error(`${actionLabel(value)}还缺少必要设置`);
}

export function createKeyboardConfig({ keymap, encoder, voiceShortcut = "Ctrl+Shift+Space" }) {
  if (!Array.isArray(keymap) || keymap.length !== 8) throw new Error("按键映射必须包含 8 个按键");
  const normalizedEncoder = normalizeEncoder(encoder);
  const keys = Object.fromEntries(keymap.map((binding, index) => [`KEY${index + 1}`, { press: firmwareAction(binding) }]));
  return {
    schema: "ai_keyboard.v1",
    target_platform: "windows",
    ptt_hotkey: voiceShortcut,
    ptt_hotkey_source: voiceShortcut === "Ctrl+Shift+Space" ? "platform_default" : "custom",
    edit_ptt_hotkey: "Ctrl+Shift+E",
    edit_ptt_hotkey_source: "platform_default",
    hotkey_mode: "toggle",
    audio_enabled: false,
    audio_source: "computer",
    microphone_source: "computer",
    profiles: [{
      id: "default",
      keys,
      encoder: {
        left: "disabled",
        right: "disabled",
        press: firmwareAction(normalizedEncoder.press),
        scroll: {
          enabled: true,
          mode: normalizedEncoder.mode,
          axis: normalizedEncoder.axis,
          speed: normalizedEncoder.speed,
          windows_reverse_vertical: normalizedEncoder.reverseVertical,
          windows_reverse_horizontal: normalizedEncoder.reverseHorizontal,
        },
      },
    }],
  };
}
