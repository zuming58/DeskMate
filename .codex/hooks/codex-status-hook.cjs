const { sendCodexHookEvent } = require("../../electron/codex-hook-state.cjs");

const MAX_STDIN_BYTES = 1024 * 1024;
let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (Buffer.byteLength(input, "utf8") > MAX_STDIN_BYTES) process.exit(0);
});
process.stdin.on("end", async () => {
  let value;
  try { value = JSON.parse(input); } catch { process.exit(0); return; }
  await sendCodexHookEvent(value).catch(() => {});
  process.exit(0);
});
process.stdin.resume();
