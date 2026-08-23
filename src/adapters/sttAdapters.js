const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
function result(status, provider, started, extra = {}) { return { status, text: "", provider, durationMs: Date.now() - started, message: "", ...extra }; }
function audioError(blob, maxBytes, provider, started) { if (!(blob instanceof Blob)) return result("error", provider, started, { message: "录音数据无效" }); if (blob.size > maxBytes) return result("error", provider, started, { message: `录音文件超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制` }); return null; }
export function validateSttEndpoint(value) {
  let endpoint;
  try { endpoint = new URL(value); } catch { throw new Error("转写服务地址无效"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) throw new Error("转写服务必须使用 HTTPS；本机服务可使用 HTTP localhost");
  const secretQuery = [...endpoint.searchParams.keys()].some((key) => /token|api.?key|password|secret|credential/i.test(key));
  if (endpoint.username || endpoint.password || secretQuery) throw new Error("转写服务地址不能包含用户名、密码或 Token");
  return endpoint;
}
export class MockSttAdapter { constructor(text = "这是设备模拟器生成的测试转写。", { maxBytes = DEFAULT_MAX_BYTES } = {}) { this.text = text; this.maxBytes = maxBytes; } async transcribe(blob, { signal } = {}) { const started = Date.now(); if (signal?.aborted) return result("cancelled", "mock", started, { message: "转写已取消" }); return audioError(blob, this.maxBytes, "mock", started) || result("success", "mock", started, { text: this.text }); } }
export class BailianSttAdapter {
  constructor({ bridge = globalThis.desktopBridge, maxBytes = 10 * 1024 * 1024 } = {}) { this.bridge = bridge; this.maxBytes = maxBytes; }
  async transcribe(blob, { signal } = {}) {
    const started = Date.now();
    if (signal?.aborted) return result("cancelled", "qwen3-asr-flash", started, { message: "转写已取消" });
    const invalidAudio = audioError(blob, this.maxBytes, "qwen3-asr-flash", started); if (invalidAudio) return invalidAudio;
    if (typeof this.bridge?.transcribeBailian !== "function") return result("pending", "qwen3-asr-flash", started, { message: "千问识别仅在 DeskMate 桌面版可用" });
    const requestId = globalThis.crypto?.randomUUID?.() || `asr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cancel = () => this.bridge?.cancelBailian?.(requestId);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await this.bridge.transcribeBailian({ requestId, audio: await blob.arrayBuffer(), mimeType: blob.type || "audio/webm" });
      if (signal?.aborted) return result("cancelled", "qwen3-asr-flash", started, { message: "转写已取消" });
      return result("success", "qwen3-asr-flash", started, { text: response.text, language: response.language, emotion: response.emotion, requestId: response.requestId });
    } catch (error) { return signal?.aborted ? result("cancelled", "qwen3-asr-flash", started, { message: "转写已取消" }) : result("error", "qwen3-asr-flash", started, { message: error.message || "千问 ASR 转写失败" }); }
    finally { signal?.removeEventListener("abort", cancel); }
  }
}
export class HttpSttAdapter {
  constructor({ endpoint = "", provider = "http", timeoutMs = 15000, maxBytes = DEFAULT_MAX_BYTES, fetchImpl = globalThis.fetch } = {}) { Object.assign(this, { endpoint, provider, timeoutMs, maxBytes, fetchImpl }); }
  async transcribe(blob, { signal } = {}) {
    const started = Date.now();
    if (signal?.aborted) return result("cancelled", this.provider, started, { message: "转写已取消" });
    if (!this.endpoint) return result("pending", this.provider, started, { message: "转写服务未配置" });
    let endpoint;
    try { endpoint = validateSttEndpoint(this.endpoint); } catch (error) { return result("error", this.provider, started, { message: error.message }); }
    const invalidAudio = audioError(blob, this.maxBytes, this.provider, started); if (invalidAudio) return invalidAudio;
    if (typeof this.fetchImpl !== "function") return result("error", this.provider, started, { message: "当前环境不支持 HTTP 转写" });
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs); const abort = () => controller.abort("cancelled"); signal?.addEventListener("abort", abort, { once: true });
    try { let response; for (let attempt = 0; attempt < 2; attempt += 1) { try { response = await this.fetchImpl(endpoint.href, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob, signal: controller.signal }); if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.retryable = response.status >= 500; throw error; } break; } catch (error) { if (attempt || controller.signal.aborted || error.retryable === false || /^HTTP 4/.test(error.message)) throw error; } } const data = await response.json(); if (typeof data.text !== "string") throw new Error("服务响应缺少 text 字段"); return result("success", this.provider, started, { text: data.text }); }
    catch (error) { if (controller.signal.aborted) return result(signal?.aborted ? "cancelled" : "error", this.provider, started, { message: signal?.aborted ? "转写已取消" : "转写请求超时" }); return result("error", this.provider, started, { message: `转写失败：${error.message}` }); }
    finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
  }
}
function applyRules(text, rules = []) { return rules.reduce((value, rule) => rule.from ? value.split(rule.from).join(rule.to) : value, String(text || "")).trim(); }
function organizerErrorType(error, aborted = false) {
  if (aborted) return "cancelled";
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("timeout") || message.includes("超时")) return "timeout";
  if (message.includes("api key") || message.includes("密钥") || message.includes("配置")) return "configuration";
  return "request-failed";
}
export class BailianTextOrganizer {
  constructor({ bridge = globalThis.desktopBridge } = {}) { this.bridge = bridge; }
  async organize(text, { mode, hotwords = [], rules = [], customRule = "", signal } = {}) {
    if (typeof this.bridge?.organizeBailian !== "function") throw new Error("千问文字整理仅在 DeskMate 桌面版可用");
    const requestId = globalThis.crypto?.randomUUID?.() || `organizer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cancel = () => this.bridge?.cancelBailianOrganizer?.(requestId);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) throw new Error("千问文字整理已取消");
      return await this.bridge.organizeBailian({ requestId, text, mode, hotwords, rules, customRule });
    } finally { signal?.removeEventListener("abort", cancel); }
  }
}
export class ConfigurableTextOrganizer {
  constructor({ smartOrganizer = null } = {}) { this.smartOrganizer = smartOrganizer; }
  async organize(text, { mode = "raw", rules = [], hotwords = [], customRule = "", signal } = {}) {
    const raw = applyRules(text, rules);
    if (mode === "raw") return { text: raw, mode: "raw", model: "local-rules", durationMs: 0, status: "success", fallback: false };
    if (mode === "custom" && !customRule.trim()) return { text: raw, mode: "raw", model: "local-rules", durationMs: 0, status: "fallback", fallback: true, message: "未配置自定义规则，已按原样整理" };
    if (!this.smartOrganizer) return { text: raw, mode: "raw", model: "unconfigured", durationMs: 0, status: "fallback", fallback: true, message: `${mode === "smart" ? "智能" : "自定义"}整理未配置，已按原样整理` };
    const invoke = typeof this.smartOrganizer === "function" ? this.smartOrganizer : this.smartOrganizer.organize.bind(this.smartOrganizer);
    try {
      const result = await invoke(raw, { mode, customRule, hotwords, rules, signal });
      const value = typeof result === "string" ? { text: result } : result;
      if (!String(value?.text || "").trim()) throw new Error("整理结果为空");
      return { ...value, text: String(value.text).trim(), mode, fallback: false, status: value.status || "success" };
    } catch (error) {
      return { text: raw, mode: "raw", model: "qwen3.7-flash", durationMs: 0, status: signal?.aborted ? "cancelled" : "error", fallback: true, message: signal?.aborted ? "整理已取消，保留原始转写" : "整理服务失败，已保留原始转写", errorType: organizerErrorType(error, signal?.aborted) };
    }
  }
}
