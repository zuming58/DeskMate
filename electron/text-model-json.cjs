const { validateApiKey, endpointForWorkspace } = require("./bailian.cjs");
const { validateEndpoint, validateSecret } = require("./secure-ai-services.cjs");

function parseJsonContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("text-model-json-empty");
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); }
  catch { throw new Error("text-model-json-invalid"); }
}

async function requestTextModelJson({ secret = {}, messages, temperature = 0.1, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error("text-model-messages-invalid");
  const endpoint = secret.endpoint ? validateEndpoint(secret.endpoint) : endpointForWorkspace(secret.workspaceId || "");
  const apiKey = secret.endpoint ? validateSecret(secret.apiKey) : validateApiKey(secret.apiKey);
  if (typeof fetchImpl !== "function") throw new Error("text-model-fetch-unavailable");
  const body = { model: String(secret.model || "qwen3.7-flash"), messages, response_format: { type: "json_object" }, temperature, stream: false };
  if (secret.provider === "bailian") body.enable_thinking = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    let data = {};
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error("text-model-request-failed");
    return parseJsonContent(data);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("text-model-request-timeout");
    throw error;
  } finally { clearTimeout(timer); }
}

module.exports = { parseJsonContent, requestTextModelJson };
