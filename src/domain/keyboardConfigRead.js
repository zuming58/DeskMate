const TRANSIENT_CONFIG_READ_REASONS = new Set([
  "config-read-timeout",
  "config-read-in-progress",
  "input-bridge-unavailable",
  "input-bridge-restarting",
  "input-bridge-exited",
  "easyinput-not-connected",
  "easyinput-disconnected",
]);

export function isTransientKeyboardConfigReadFailure(reason) {
  return TRANSIENT_CONFIG_READ_REASONS.has(String(reason || ""));
}

export function keyboardConfigReadMessage(reason) {
  switch (String(reason || "")) {
    case "easyinput-not-connected":
    case "easyinput-disconnected":
      return "等待 EasyInput 连接";
    case "config-read-timeout":
      return "设备已连接，配置通道暂未响应";
    case "config-read-in-progress":
    case "config-sync-in-progress":
      return "配置通道正忙，请稍后重试";
    case "config-read-v1-unsupported":
      return "当前固件不支持配置读取";
    case "input-bridge-unavailable":
    case "input-bridge-restarting":
    case "input-bridge-exited":
      return "键盘服务正在启动";
    case "config-json-invalid":
    case "config-schema-invalid":
    case "config-snapshot-invalid":
      return "板上配置格式无法识别";
    default:
      return "键盘配置读取失败";
  }
}

export async function readKeyboardConfigWithRetry({
  read,
  retryDelaysMs = [0, 400, 1200],
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (typeof read !== "function") return { ok: false, reason: "input-bridge-unavailable", attempts: 0 };
  const schedule = Array.isArray(retryDelaysMs) && retryDelaysMs.length > 0 ? retryDelaysMs : [0];
  let last = { ok: false, reason: "config-read-timeout" };
  for (let index = 0; index < schedule.length; index += 1) {
    const delay = Number(schedule[index]) || 0;
    if (delay > 0) await wait(delay);
    try {
      last = await read();
    } catch (error) {
      last = { ok: false, reason: error?.message || "config-read-failed" };
    }
    if (last?.ok || !isTransientKeyboardConfigReadFailure(last?.reason)) return { ...last, attempts: index + 1 };
  }
  return { ...last, attempts: schedule.length };
}
