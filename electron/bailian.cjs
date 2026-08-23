const DEFAULT_MODEL = "qwen3-asr-flash";
const DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function validateApiKey(value) {
  const key = String(value || "").trim();
  if (!/^sk-[A-Za-z0-9_-]{8,252}$/.test(key)) throw new Error("百炼 API Key 格式无效");
  return key;
}

function validateWorkspaceId(value) {
  const workspaceId = String(value || "").trim();
  if (workspaceId && !/^[a-z0-9-]{6,80}$/i.test(workspaceId)) throw new Error("业务空间 ID 格式无效");
  return workspaceId;
}

function endpointForWorkspace(workspaceId = "") {
  const id = validateWorkspaceId(workspaceId);
  return id ? `https://${id}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions` : DEFAULT_ENDPOINT;
}

function normalizeAudio(audio, mimeType = "audio/webm") {
  const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || []);
  if (!bytes.length) throw new Error("录音数据为空");
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error("录音超过千问 ASR 的 10 MB 限制");
  const safeMime = /^audio\/[a-z0-9.+-]+$/i.test(mimeType) ? mimeType : "audio/webm";
  return `data:${safeMime};base64,${bytes.toString("base64")}`;
}

function buildRequest(audio, { mimeType = "audio/webm", model = DEFAULT_MODEL } = {}) {
  return {
    model,
    messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: normalizeAudio(audio, mimeType) } }] }],
    stream: false,
    asr_options: { enable_itn: true },
  };
}

function parseResponse(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("千问 ASR 响应中没有识别文字");
  return {
    text: text.trim(),
    language: data?.choices?.[0]?.message?.annotations?.[0]?.language || "",
    emotion: data?.choices?.[0]?.message?.annotations?.[0]?.emotion || "",
    requestId: data?.id || "",
  };
}

async function transcribe({ apiKey, workspaceId = "", audio, mimeType, fetchImpl = globalThis.fetch, timeoutMs = 60000, signal }) {
  const key = validateApiKey(apiKey);
  if (typeof fetchImpl !== "function") throw new Error("当前运行环境不支持千问 ASR 请求");
  const controller = new AbortController();
  const cancel = () => controller.abort("cancelled");
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpointForWorkspace(workspaceId), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest(audio, { mimeType })),
      signal: controller.signal,
    });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const message = data?.error?.message || data?.message || `HTTP ${response.status}`;
      throw new Error(`千问 ASR 请求失败：${message}`);
    }
    return parseResponse(data);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? "千问 ASR 转写已取消" : "千问 ASR 请求超时");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

module.exports = { DEFAULT_ENDPOINT, DEFAULT_MODEL, MAX_AUDIO_BYTES, buildRequest, endpointForWorkspace, parseResponse, transcribe, validateApiKey, validateWorkspaceId };
