const { validateApiKey, endpointForWorkspace } = require("./bailian.cjs");
const { validateEndpoint, validateSecret } = require("./secure-ai-services.cjs");

function parseJsonContent(data) {
  if (data?.choices?.[0]?.finish_reason === 'length') throw new Error('text-model-output-truncated');
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("text-model-json-empty");
  try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()); }
  catch { throw new Error("text-model-json-invalid"); }
}

async function requestTextModelJson({ secret = {}, messages, temperature = 0.1, fetchImpl = globalThis.fetch, timeoutMs = 20000, nonThinking = false, maxTokens } = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error("text-model-messages-invalid");
  const endpoint = secret.endpoint ? validateEndpoint(secret.endpoint) : endpointForWorkspace(secret.workspaceId || "");
  const apiKey = secret.endpoint ? validateSecret(secret.apiKey) : validateApiKey(secret.apiKey);
  if (typeof fetchImpl !== "function") throw new Error("text-model-fetch-unavailable");
  const body = { model: String(secret.model || "qwen3.7-flash"), messages, response_format: { type: "json_object" }, temperature, stream: false };
  if (secret.provider === "bailian") body.enable_thinking = false;
  if (nonThinking && secret.provider === "deepseek" && /^deepseek-v4-(?:flash|pro)(?:-|$)/.test(secret.model) && new URL(endpoint).hostname === "api.deepseek.com") body.thinking = { type: "disabled" };
  if (Number.isInteger(maxTokens) && maxTokens > 0 && maxTokens <= 8192) body.max_tokens = maxTokens;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    let data = {};
    try { data = await response.json(); } catch { /* handled below */ }
    if (controller.signal.aborted) throw new Error("text-model-request-timeout");
    if (!response.ok) throw new Error("text-model-request-failed");
    return parseJsonContent(data);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("text-model-request-timeout");
    throw error;
  } finally { clearTimeout(timer); }
}

module.exports = { parseJsonContent, requestTextModelJson };
