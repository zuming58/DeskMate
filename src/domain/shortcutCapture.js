const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

function mainKey(event) {
  if (event.code === "Space") return "Space";
  if (event.code === "Tab") return "Tab";
  if (event.code === "Enter" || event.code === "NumpadEnter") return "Enter";
  if (event.code === "Escape") return "Esc";
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)) return event.code;
  return "";
}

export function shortcutFromKeyboardEvent(event) {
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  if (MODIFIER_KEYS.has(event.key)) return { pending: true, display: modifiers.join("+") };
  const key = mainKey(event);
  if (!key) return { error: "该按键不能注册为全局快捷键" };
  if (!modifiers.length) return { error: "快捷键至少需要 Ctrl、Alt、Shift 或 Win 中的一个修饰键" };
  return { shortcut: [...modifiers, key].join("+") };
}

