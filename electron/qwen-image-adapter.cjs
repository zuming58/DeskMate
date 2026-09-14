const { validateApiKey, validateWorkspaceId } = require("./bailian.cjs");
const { RESULT_LIMIT, validateImage } = require("./style-studio-store.cjs");

const MODEL = "qwen-image-3.0";
const DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations";

function endpointForImageWorkspace(workspaceId = "") {
  const id = validateWorkspaceId(workspaceId);
  return id ? `https://${id}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/images/generations` : DEFAULT_ENDPOINT;
}

function buildImageRequest({ sourceBytes, sourceMime, prompt }) {
  const bytes = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(sourceBytes || []);
  validateImage(bytes, sourceMime, 10 * 1024 * 1024);
  const text = String(prompt || "").trim();
  if (!text || text.length > 20_000) throw new Error("qwen-image-prompt-invalid");
  return {
    model: MODEL,
    prompt: text,
    image: `data:${sourceMime};base64,${bytes.toString("base64")}`,
    size: "auto",
    n: 1,
    prompt_extend: true,
    prompt_extend_mode: "direct",
    enable_thinking: false,
    watermark: false,
  };
}

function safeRequestId(response) {
  const value = String(response?.headers?.get?.("x-request-id") || "");
  return /^[A-Za-z0-9._:-]{1,160}$/.test(value) ? value : "";
}

function validateResultUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("qwen-image-result-url-invalid"); }
  if (url.protocol !== "https:" || !(url.hostname === "aliyuncs.com" || url.hostname.endsWith(".aliyuncs.com"))) throw new Error("qwen-image-result-url-invalid");
  return url.href;
}

async function parseJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function readBoundedResponse(response, limit) {
  if (!response.body?.getReader) {
    const value = Buffer.from(await response.arrayBuffer());
    if (value.length > limit) throw new Error("qwen-image-result-too-large");
    return value;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > limit) { await reader.cancel(); throw new Error("qwen-image-result-too-large"); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function generateQwenImage({ apiKey, workspaceId = "", sourceBytes, sourceMime, prompt, fetchImpl = globalThis.fetch, timeoutMs = 600_000, signal }) {
  const key = validateApiKey(apiKey);
  if (typeof fetchImpl !== "function") throw new Error("qwen-image-fetch-unavailable");
  const controller = new AbortController();
  const abort = () => controller.abort("cancelled");
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort("timeout"), Math.max(1_000, Math.min(600_000, Number(timeoutMs) || 600_000)));
  try {
    const response = await fetchImpl(endpointForImageWorkspace(workspaceId), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildImageRequest({ sourceBytes, sourceMime, prompt })),
      signal: controller.signal,
    });
    const requestId = safeRequestId(response);
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(`qwen-image-http-${Number(response.status) || 500}`);
    const resultUrl = validateResultUrl(payload?.data?.[0]?.url);
    const download = await fetchImpl(resultUrl, { method: "GET", signal: controller.signal, redirect: "follow" });
    if (!download.ok) throw new Error(`qwen-image-download-http-${Number(download.status) || 500}`);
    if (download.url) validateResultUrl(download.url);
    const length = Number(download.headers?.get?.("content-length") || 0);
    if (length > RESULT_LIMIT) throw new Error("qwen-image-result-too-large");
    const bytes = await readBoundedResponse(download, RESULT_LIMIT);
    const declaredMime = String(download.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const checked = validateImage(bytes, ["image/png", "image/jpeg", "image/webp"].includes(declaredMime) ? declaredMime : "", RESULT_LIMIT);
    return {
      bytes: checked.data,
      mime: checked.mime,
      requestId,
      usage: {
        outputWidth: Number(payload?.usage?.output_width) || checked.width || 0,
        outputHeight: Number(payload?.usage?.output_height) || checked.height || 0,
        inputImageCount: Number(payload?.usage?.input_image_count) || 1,
        outputImageCount: Number(payload?.usage?.output_image_count) || 1,
      },
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted || controller.signal.reason === "cancelled" ? "qwen-image-cancelled" : "qwen-image-timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

module.exports = { DEFAULT_ENDPOINT, MODEL, buildImageRequest, endpointForImageWorkspace, generateQwenImage, readBoundedResponse, validateResultUrl };
