const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

function mainKey(event) {
  if (event.code === "Space") return "Space";
  if (event.code === "Backspace") return "Backspace";
  if (event.code === "Tab") return "Tab";
  if (event.code === "Enter" || event.code === "NumpadEnter") return "Enter";
  if (event.code === "Escape") return "Esc";
  if (event.code === "ArrowRight") return "ArrowRight";
  if (event.code === "ArrowLeft") return "ArrowLeft";
  if (event.code === "ArrowDown") return "ArrowDown";
  if (event.code === "ArrowUp") return "ArrowUp";
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)) return event.code;
  return "";
}

export function shortcutFromKeyboardEvent(event, { allowSingle = false } = {}) {
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  if (MODIFIER_KEYS.has(event.key)) return { pending: true, display: modifiers.join("+") };
  const key = mainKey(event);
  if (!key) return { error: "该按键不能注册为全局快捷键" };
  if (!modifiers.length && !allowSingle) return { error: "快捷键至少需要 Ctrl、Alt、Shift 或 Win 中的一个修饰键" };
  return { shortcut: [...modifiers, key].join("+") };
}

const DISPLAY_KEYS = new Map([
  ["Enter", "回车"],
  ["Return", "回车"],
  ["Backspace", "退格"],
  ["Space", "空格"],
  ["Tab", "Tab"],
  ["Esc", "Esc"],
  ["Escape", "Esc"],
  ["ArrowRight", "右方向键"],
  ["ArrowLeft", "左方向键"],
  ["ArrowDown", "下方向键"],
  ["ArrowUp", "上方向键"],
]);

export function shortcutDisplay(value) {
  if (typeof value !== "string") return "";
  return value.split("+").map((part) => DISPLAY_KEYS.get(part) || part).join("+");
}
