const { createHash } = require("crypto");
const { COMPANION_CALL_ACTION } = require("./companion-call.cjs");

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
function configFingerprint(value) { return createHash("sha256").update(JSON.stringify(stable(value)), "utf8").digest("hex").slice(0, 16); }

const firmwareToUi = new Map([
  ["voice_ptt_hold", "voice-input"], ["edit_ptt_hold", "voice-edit"], ["select_all", "select-all"],
  ["scroll_axis_toggle", "scroll-axis-toggle"], ["text_caret_select", "text-caret-select"],
]);

function sanitizedBinding(press, describeAppAction) {
  if (typeof press === "string" && press.startsWith("host_action:")) {
    const appActionId = press.slice(12);
    if (appActionId === COMPANION_CALL_ACTION.id) return { action: COMPANION_CALL_ACTION.kind };
    const description = typeof describeAppAction === "function" ? describeAppAction(appActionId) : null;
    return description?.id === appActionId && typeof description.label === "string"
      ? { action: "open-app", appActionId, appName: description.label }
      : { action: "open-app" };
  }
  if (typeof press === "string") return { action: firmwareToUi.get(press) || press };
  if (press && typeof press === "object" && typeof press.hotkey === "string") return { action: "hotkey", shortcut: press.hotkey };
  return { action: press && typeof press.text === "string" ? "fixed-text" : "disabled" };
}

function sanitizeKeyboardConfig(value, describeAppAction) {
  const profile = Array.isArray(value?.profiles) ? value.profiles[0] : null;
  const keys = profile?.keys && typeof profile.keys === "object" ? Array.from({ length: 8 }, (_, index) => sanitizedBinding(profile.keys[`KEY${index + 1}`]?.press, describeAppAction)) : [];
  const scroll = profile?.encoder?.scroll || {};
  return { keymap: keys, encoder: { mode: scroll.mode === "cursor" ? "cursor" : "scroll", axis: scroll.axis === "horizontal" ? "horizontal" : "vertical", speed: Math.max(1, Math.min(5, Number(scroll.speed) || 3)), reverseVertical: Boolean(scroll.windows_reverse_vertical), reverseHorizontal: Boolean(scroll.windows_reverse_horizontal), press: sanitizedBinding(profile?.encoder?.press, describeAppAction) } };
}

const KEY_ACTIONS = new Set(["voice-input", "voice-edit", "select-all", "copy", "paste", "undo", "disabled", "enter", "backspace", "hotkey", "fixed-text", "open-app", "companion-call"]);
const ENCODER_ACTIONS = new Set(["scroll-axis-toggle", "text-caret-select", "disabled", "hotkey", "enter", "backspace", "fixed-text", "open-app"]);

function bindingToPress(item, allowed = KEY_ACTIONS) {
  if (!item || typeof item !== "object" || !allowed.has(item.action)) throw new Error("按键动作未批准");
  if (item.action === "voice-input") return "voice_ptt_hold";
  if (item.action === "voice-edit") return "edit_ptt_hold";
  if (item.action === "select-all") return "select_all";
  if (item.action === "scroll-axis-toggle") return "scroll_axis_toggle";
  if (item.action === "text-caret-select") return "text_caret_select";
  if (["copy", "paste", "undo", "disabled"].includes(item.action)) return item.action;
  if (item.action === "companion-call") return `host_action:${COMPANION_CALL_ACTION.id}`;
  if (item.action === "fixed-text") {
    if (typeof item.text !== "string") throw new Error("固定文字无效");
    const bytes = Buffer.from(item.text, "utf8");
    if (bytes.length < 1 || bytes.length > 960 || item.text.includes("\0") || /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(item.text)) throw new Error("固定文字无效");
    return { text: item.text };
  }
  if (item.action === "open-app") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.appActionId || "")) throw new Error("应用映射无效");
    return `host_action:${item.appActionId}`;
  }
  const hotkey = item.action === "enter" ? "Return" : item.action === "backspace" ? "Backspace" : item.shortcut;
  if (typeof hotkey !== "string" || !hotkey || hotkey.length > 64) throw new Error("快捷键无效");
  return { hotkey };
}

function mergeKeyboardPatch(raw, patch) {
  if (!raw || raw.schema !== "ai_keyboard.v1" || !patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("配置修改格式无效");
  const merged = structuredClone(raw); const profile = Array.isArray(merged.profiles) && merged.profiles[0];
  if (!profile || typeof profile !== "object" || !profile.keys || typeof profile.keys !== "object") throw new Error("配置缺少默认 Profile");
  for (const key of Object.keys(patch)) if (!["keymap", "encoder"].includes(key)) throw new Error("配置包含未批准字段");
  if (patch.encoder !== undefined) {
    const e = patch.encoder; if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error("旋钮修改格式无效");
    for (const key of Object.keys(e)) if (!["mode", "axis", "speed", "reverseVertical", "reverseHorizontal", "press"].includes(key)) throw new Error("旋钮字段未批准");
    profile.encoder = profile.encoder && typeof profile.encoder === "object" ? profile.encoder : {}; profile.encoder.scroll = profile.encoder.scroll && typeof profile.encoder.scroll === "object" ? profile.encoder.scroll : {};
    if (e.mode !== undefined && !["scroll", "cursor"].includes(e.mode)) throw new Error("旋钮模式无效");
    if (e.axis !== undefined && !["vertical", "horizontal"].includes(e.axis)) throw new Error("旋钮轴无效");
    if (e.speed !== undefined && (!Number.isInteger(e.speed) || e.speed < 1 || e.speed > 5)) throw new Error("旋钮速度无效");
    if (e.reverseVertical !== undefined && typeof e.reverseVertical !== "boolean") throw new Error("反向设置无效");
    if (e.reverseHorizontal !== undefined && typeof e.reverseHorizontal !== "boolean") throw new Error("反向设置无效");
    for (const [source, target] of [["mode", "mode"], ["axis", "axis"], ["speed", "speed"], ["reverseVertical", "windows_reverse_vertical"], ["reverseHorizontal", "windows_reverse_horizontal"]]) if (e[source] !== undefined) profile.encoder.scroll[target] = e[source];
    if (e.press !== undefined) profile.encoder.press = bindingToPress(typeof e.press === "string" ? { action: e.press } : e.press, ENCODER_ACTIONS);
  }
  if (patch.keymap !== undefined) {
    const entries = Array.isArray(patch.keymap) ? (patch.keymap.length === 8 ? patch.keymap.map((item, index) => [index, item]) : (() => { throw new Error("按键映射必须包含八项"); })()) : Object.entries(patch.keymap).map(([key, item]) => { const match = /^KEY([1-8])$/.exec(key); if (!match) throw new Error("按键路径未批准"); return [Number(match[1]) - 1, item]; });
    for (const [index, item] of entries) {
      if (!Number.isInteger(index) || index < 0 || index > 7) throw new Error("按键索引无效");
      profile.keys[`KEY${index + 1}`] = { ...profile.keys[`KEY${index + 1}`], press: bindingToPress(item) };
    }
  }
  return merged;
}

function sanitizedDiff(before, after, describeAppAction) { const a = sanitizeKeyboardConfig(before, describeAppAction); const b = sanitizeKeyboardConfig(after, describeAppAction); const diff = []; a.keymap.forEach((value, index) => { if (JSON.stringify(value) !== JSON.stringify(b.keymap[index])) diff.push({ path: `/profiles/0/keys/KEY${index + 1}/press`, before: value, after: b.keymap[index] }); }); for (const key of ["mode", "axis", "speed", "reverseVertical", "reverseHorizontal", "press"]) { const beforeValue = a.encoder[key]; const afterValue = b.encoder[key]; if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) diff.push({ path: `/profiles/0/encoder/${key}`, before: beforeValue, after: afterValue }); } return diff; }

function requiredHostCapabilities(value) {
  const required = new Set();
  const profile = Array.isArray(value?.profiles) ? value.profiles[0] : null;
  const presses = [...Object.values(profile?.keys || {}).map((item) => item?.press), profile?.encoder?.press];
  for (const press of presses) {
    if (typeof press === "string" && press.startsWith("host_action:")) required.add("host_action_v1");
    if (press && typeof press === "object" && !Array.isArray(press) && typeof press.text === "string") required.add("fixed_text_v1");
  }
  return [...required].sort();
}

function checkHostCapabilities(value, capabilities) {
  const missing = requiredHostCapabilities(value).filter((capability) => capabilities?.[capability] !== true);
  return missing.length ? { ok: false, reason: `${missing[0]}-unsupported`, missing } : { ok: true };
}

module.exports = { stable, configFingerprint, sanitizeKeyboardConfig, mergeKeyboardPatch, sanitizedDiff, requiredHostCapabilities, checkHostCapabilities };
