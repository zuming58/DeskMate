const COPY_SELECTION_SCRIPT = [
  "$expected = [Int64]::Parse($env:DESKMATE_TARGET_WINDOW)",
  "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class DeskMateForeground { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }'",
  "$current = [DeskMateForeground]::GetForegroundWindow().ToInt64()",
  "if ($current -ne $expected) { [Console]::Error.Write('target-window-changed'); exit 2 }",
  "Add-Type -AssemblyName System.Windows.Forms",
  "[System.Windows.Forms.SendKeys]::SendWait('^c')",
].join("; ");

async function captureSelectedText({
  targetWindow,
  readClipboardText,
  writeClipboardText,
  snapshotClipboard,
  restoreClipboard,
  runCopy,
  marker = `deskmate-selection-${Date.now()}`,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 900,
  pollMs = 35,
  maxChars = 20000,
} = {}) {
  const normalizedTarget = String(targetWindow || "");
  if (!/^[1-9]\d{0,19}$/.test(normalizedTarget)) return { ok: false, reason: "no-captured-target" };
  if (![readClipboardText, writeClipboardText, snapshotClipboard, restoreClipboard, runCopy].every((value) => typeof value === "function")) return { ok: false, reason: "selection-capture-unavailable" };

  let snapshot;
  try { snapshot = await snapshotClipboard(); }
  catch { return { ok: false, reason: "clipboard-snapshot-failed" }; }
  let result;
  try {
    result = await (async () => {
      await writeClipboardText(marker);
      const copy = await runCopy(normalizedTarget);
      if (!copy?.ok) return { ok: false, reason: copy?.reason || "selection-copy-failed" };
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        const text = String((await readClipboardText()) || "");
        if (text !== marker) {
          if (!text.trim()) return { ok: false, reason: "selection-empty" };
          if (text.length > maxChars) return { ok: false, reason: "selection-too-long" };
          return { ok: true, text };
        }
        await wait(pollMs);
      }
      return { ok: false, reason: "selection-copy-timeout" };
    })();
  } catch { result = { ok: false, reason: "selection-capture-failed" }; }
  try { await restoreClipboard(snapshot); }
  catch { return { ok: false, reason: "clipboard-restore-failed" }; }
  return result;
}

module.exports = { COPY_SELECTION_SCRIPT, captureSelectedText };
