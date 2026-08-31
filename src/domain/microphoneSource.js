export const MICROPHONE_SOURCES = Object.freeze(["computer", "easyinput"]);

export function normalizeMicrophoneSource(value) {
  return MICROPHONE_SOURCES.includes(value) ? value : "computer";
}

export function microphoneSourceFailureMessage(reason) {
  const messages = {
    "easyinput-audio-not-configured": "尚未配置 EasyInput 音频网络",
    "easyinput-audio-heartbeat-timeout": "没有收到 EasyInput 板载音频心跳",
    "easyinput-audio-device-unavailable": "EasyInput 板载音频尚未就绪",
    "easyinput-audio-unavailable": "EasyInput 板载音频不可用",
    "easyinput-audio-port-unavailable": "EasyInput 音频监听端口不可用",
    "multiple-easyinput-audio-sources": "检测到多个 EasyInput 音频来源",
    "easyinput-audio-session-active": "EasyInput 音频正被其他会话使用",
    "desktop-bridge-unavailable": "DeskMate 桌面音频桥不可用",
  };
  return messages[String(reason || "")] || "EasyInput 板载音频不可用";
}

export async function startMicrophoneSession({ preferredSource, startComputer, startEasyInput }) {
  const requestedSource = normalizeMicrophoneSource(preferredSource);
  if (requestedSource === "computer") {
    const computer = await startComputer();
    return computer?.ok ? { ok: true, requestedSource, activeSource: "computer", fallback: null } : { ok: false, requestedSource, activeSource: null, reason: computer?.reason || "computer-microphone-unavailable" };
  }
  const board = await startEasyInput();
  if (board?.ok) return { ok: true, requestedSource, activeSource: "easyinput", fallback: null };
  const computer = await startComputer();
  if (!computer?.ok) return { ok: false, requestedSource, activeSource: null, reason: computer?.reason || "computer-microphone-unavailable", boardReason: board?.reason || "easyinput-audio-unavailable" };
  return { ok: true, requestedSource, activeSource: "computer", fallback: { from: "easyinput", to: "computer", reason: board?.reason || "easyinput-audio-unavailable" } };
}
