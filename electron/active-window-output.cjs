async function pasteIntoCapturedWindow({ text, targetWindow, writeClipboard, runPaste } = {}) {
  const value = String(text || "");
  if (!value || value.length > 100000) return { ok: false, reason: "invalid-text" };
  const normalizedTarget = String(targetWindow || "");
  if (!/^[1-9]\d{0,19}$/.test(normalizedTarget)) return { ok: false, reason: "no-captured-target" };
  if (typeof writeClipboard !== "function" || typeof runPaste !== "function") return { ok: false, reason: "active-window-output-unavailable" };

  writeClipboard(value);
  let result;
  try { result = await runPaste(normalizedTarget); }
  catch (error) { result = { ok: false, reason: error?.message || "active-window-output-failed" }; }
  return result?.ok ? { ok: true, mode: "active-window" } : { ok: false, reason: result?.reason || "active-window-output-failed" };
}

module.exports = { pasteIntoCapturedWindow };
