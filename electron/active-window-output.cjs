const PASTE_CAPTURED_WINDOW_SCRIPT = [
  "$expected = [Int64]::Parse($env:DESKMATE_TARGET_WINDOW)",
  "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class DeskMateForeground { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }'",
  "$current = [DeskMateForeground]::GetForegroundWindow().ToInt64()",
  "if ($current -ne $expected) { [Console]::Error.Write('target-window-changed'); exit 2 }",
  "Add-Type -AssemblyName System.Windows.Forms",
  "[System.Windows.Forms.SendKeys]::SendWait('^v')",
].join("; ");

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

module.exports = { PASTE_CAPTURED_WINDOW_SCRIPT, pasteIntoCapturedWindow };
