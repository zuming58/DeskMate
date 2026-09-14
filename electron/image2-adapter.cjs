const { RESULT_LIMIT, validateImage } = require("./style-studio-store.cjs");
const { IMAGE2_MODEL, normalizeImage2BaseUrl, validateImage2ApiKey } = require("./secure-image2.cjs");

const IMAGE2_TIMEOUT_MS = 20 * 60 * 1000;

function image2Endpoint(baseUrl) {
  return `${normalizeImage2BaseUrl(baseUrl)}/images/generations`;
}

function buildImage2Request({ sourceBytes, sourceMime, prompt }) {
  const bytes = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(sourceBytes || []);
  validateImage(bytes, sourceMime, 10 * 1024 * 1024);
  const text = String(prompt || "").trim();
  if (!text || text.length > 20_000) throw new Error("image2-prompt-invalid");
  return {
    model: IMAGE2_MODEL,
    prompt: text,
    size: "1024x1024",
    n: 1,
    response_format: "url",
    quality: "standard",
    output_format: "png",
    images: [`data:${sourceMime};base64,${bytes.toString("base64")}`],
  };
}

function safeId(value) {
  const id = String(value || "");
  return /^[A-Za-z0-9._:-]{1,160}$/.test(id) ? id : "";
}

function validateResultUrl(value) {
  let url;
  try { url = new URL(String(value || "")); }
  catch { throw new Error("image2-result-url-invalid"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("image2-result-url-invalid");
  return url.href;
}

function findImageItem(payload) {
  const candidates = [payload?.data, payload?.images, payload?.output, payload?.result?.data, payload?.result?.images, payload?.result?.output, payload?.result, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const item = candidate.find(entry => entry?.url || entry?.image_url || entry?.imageUrl || entry?.b64_json || entry?.base64 || entry?.image_base64);
      if (item) return item;
    } else if (candidate?.url || candidate?.image_url || candidate?.imageUrl || candidate?.b64_json || candidate?.base64 || candidate?.image_base64) return candidate;
  }
  return null;
}

async function readBounded(response, limit) {
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error("image2-result-too-large");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > limit) { await reader.cancel(); throw new Error("image2-result-too-large"); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function parsePayload(text) {
  try { return JSON.parse(text || "{}"); }
  catch { return {}; }
}

async function generateImage2({ apiKey, baseUrl, sourceBytes, sourceMime, prompt, fetchImpl = globalThis.fetch, timeoutMs = IMAGE2_TIMEOUT_MS, signal }) {
  if (typeof fetchImpl !== "function") throw new Error("image2-fetch-unavailable");
  let key;
  try { key = validateImage2ApiKey(apiKey); }
  catch { throw new Error("image2-key-invalid"); }
  const controller = new AbortController();
  const abort = () => controller.abort("cancelled");
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const boundedTimeout = Math.max(30_000, Math.min(IMAGE2_TIMEOUT_MS, Number(timeoutMs) || IMAGE2_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort("timeout"), boundedTimeout);
  try {
    let response;
    try {
      response = await fetchImpl(image2Endpoint(baseUrl), {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildImage2Request({ sourceBytes, sourceMime, prompt })),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error("image2-submission-uncertain");
    }
    const declaredLength = Number(response.headers?.get?.("content-length") || 0);
    const responseLimit = RESULT_LIMIT * 2;
    if (declaredLength > responseLimit) throw new Error("image2-result-too-large");
    const text = (await readBounded(response, responseLimit)).toString("utf8");
    const payload = parsePayload(text);
    if (!response.ok) throw new Error(`image2-http-${Number(response.status) || 500}`);
    const item = findImageItem(payload);
    if (!item) throw new Error("image2-result-missing");
    let bytes;
    let mime = "image/png";
    const encoded = item.b64_json || item.base64 || item.image_base64;
    const resultValue = item.url || item.image_url || item.imageUrl;
    if (encoded) {
      bytes = Buffer.from(String(encoded).includes(",") ? String(encoded).split(",", 2)[1] : String(encoded), "base64");
    } else if (String(resultValue || "").startsWith("data:")) {
      const [meta, body] = String(resultValue).split(",", 2);
      mime = meta.match(/^data:([^;]+)/)?.[1] || "image/png";
      bytes = Buffer.from(body, "base64");
    } else {
      const url = validateResultUrl(resultValue);
      const download = await fetchImpl(url, { method: "GET", redirect: "error", signal: controller.signal });
      if (!download.ok) throw new Error(`image2-download-http-${Number(download.status) || 500}`);
      if (download.url) validateResultUrl(download.url);
      const length = Number(download.headers?.get?.("content-length") || 0);
      if (length > RESULT_LIMIT) throw new Error("image2-result-too-large");
      mime = String(download.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase() || "image/png";
      bytes = await readBounded(download, RESULT_LIMIT);
    }
    const checked = validateImage(bytes, ["image/png", "image/jpeg", "image/webp"].includes(mime) ? mime : "", RESULT_LIMIT);
    return {
      bytes: checked.data,
      mime: checked.mime,
      requestId: safeId(response.headers?.get?.("x-request-id")) || safeId(payload?.id || payload?.request_id || payload?.requestId),
      usage: { outputWidth: checked.width || 0, outputHeight: checked.height || 0, inputImageCount: 1, outputImageCount: 1 },
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted || controller.signal.reason === "cancelled" ? "image2-cancelled" : "image2-timeout");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

module.exports = { IMAGE2_TIMEOUT_MS, buildImage2Request, generateImage2, image2Endpoint, readBounded, validateResultUrl };
