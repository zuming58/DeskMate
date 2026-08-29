export function describeTranscriptionFailure(transcript = {}) {
  const status = String(transcript.status || "error");
  const message = String(transcript.message || "").toLowerCase();
  if (status === "cancelled") return { code: "cancelled", label: "转写已取消", historyText: "录音已保存，语音转写已取消", message: "语音转写已取消，录音仍保存在历史中" };
  if (status === "pending" || /未配置|api key|密钥|配置|桌面版/.test(message)) return { code: "configuration", label: "转写未配置", historyText: "录音已保存，语音识别服务尚未配置", message: "语音识别服务尚未配置，请在设置中检查千问服务" };
  if (/timeout|超时/.test(message)) return { code: "timeout", label: "转写超时", historyText: "录音已保存，语音识别请求超时", message: "语音识别请求超时，请检查网络后重试" };
  if (/没有识别文字|没有.*文字|无.*文字|empty|no text/.test(message)) return { code: "empty-result", label: "未识别到文字", historyText: "录音已保存，但未识别到有效文字", message: "没有识别到有效文字，请靠近麦克风后重试" };
  if (/录音数据|音频|超过.*mb|invalid audio/.test(message)) return { code: "invalid-audio", label: "录音数据异常", historyText: "录音已保存，但录音数据无法用于识别", message: "录音数据无法用于识别，请检查麦克风后重试" };
  return { code: "request-failed", label: "转写请求失败", historyText: "录音已保存，语音识别请求失败", message: "语音识别请求失败，请稍后重试或查看系统诊断" };
}

export async function processVoiceRecording({ blob, stt, organizer, organizerOptions, editor, operation = "input", saveHistory, output, outputMode = "history", signal, onPhase }) {
  onPhase?.("transcribing");
  let transcript;
  try { transcript = await stt.transcribe(blob, { signal }); } catch (error) { transcript = { status: "error", text: "", provider: "unknown", durationMs: 0, message: error.message }; }
  if (transcript.status === "success" && !String(transcript.text || "").trim()) transcript = { ...transcript, status: "error", text: "", message: "transcription-empty" };
  let organized = null;
  if (transcript.status === "success") {
    if (operation === "edit") {
      onPhase?.("organizing");
      try {
        const result = await editor.edit(transcript.text, { signal });
        organized = { ...result, text: String(result?.text || "").trim(), mode: "voice-edit", fallback: false, status: result?.status || "success" };
        if (!organized.text) throw new Error("语音编辑结果为空");
      } catch (error) {
        organized = { text: transcript.text, mode: "voice-edit", status: signal?.aborted ? "cancelled" : "error", fallback: false, message: signal?.aborted ? "语音编辑已取消" : error.message || "语音编辑失败", errorType: signal?.aborted ? "cancelled" : "request-failed" };
      }
    } else {
      if (organizerOptions?.mode && organizerOptions.mode !== "raw") onPhase?.("organizing");
      try { organized = await organizer.organize(transcript.text, { ...organizerOptions, signal }); }
      catch { organized = { text: transcript.text, mode: "raw", status: signal?.aborted ? "cancelled" : "error", fallback: true, message: signal?.aborted ? "整理已取消，保留原始转写" : "整理失败，已保留原始转写" }; }
    }
  }
  const failure = transcript.status === "success" ? null : describeTranscriptionFailure(transcript);
  const text = organized?.text || failure?.historyText || "录音已保存，语音识别请求失败";
  const history = await saveHistory({ text, transcript, organized, failure });
  let outputResult = { ok: true, mode: "history" };
  if (transcript.status === "success" && organized?.status !== "cancelled" && (operation !== "edit" || organized?.status === "success")) {
    onPhase?.("outputting");
    try { outputResult = await output.output(text, outputMode); } catch (error) { outputResult = { ok: false, reason: error.message }; }
    if (outputMode === "active-window" && !outputResult?.ok) {
      const activeWindowFailure = outputResult?.reason || "active-window-output-failed";
      try {
        const fallback = await output.output(text, "clipboard");
        outputResult = fallback?.ok ? { ...fallback, fallbackFrom: "active-window", reason: activeWindowFailure } : { ok: false, mode: "clipboard", fallbackFrom: "active-window", reason: fallback?.reason || activeWindowFailure };
      } catch (error) {
        outputResult = { ok: false, mode: "clipboard", fallbackFrom: "active-window", reason: error.message || activeWindowFailure };
      }
    }
  }
  if (organized?.status === "cancelled") outputResult = { ok: false, cancelled: true, reason: "organizer-cancelled" };
  return { text, transcript, organized, failure, history, output: outputResult };
}
