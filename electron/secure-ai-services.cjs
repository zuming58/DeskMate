const fs = require("fs");
const path = require("path");

const TEXT_PROVIDERS = new Set(["deepseek", "custom"]);
const REALTIME_PROVIDERS = new Set(["doubao", "custom"]);

function requireEncryption(safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储当前不可用，未保存服务密钥");
}

function cleanText(value, name, { maxLength = 240, required = false } = {}) {
  const text = String(value || "").trim();
  if (required && !text) throw new Error(`${name}不能为空`);
  if (text.length > maxLength || /[\u0000-\u001f]/.test(text)) throw new Error(`${name}格式无效`);
  return text;
}

function validateSecret(value, name = "API Key") {
  const secret = cleanText(value, name, { required: true, maxLength: 512 });
  if (/\s/.test(secret) || secret.length < 8) throw new Error(`${name}格式无效`);
  return secret;
}

function validateEndpoint(value, { websocket = false } = {}) {
  let endpoint;
  try { endpoint = new URL(cleanText(value, "服务地址", { required: true, maxLength: 500 })); }
  catch { throw new Error("服务地址格式无效"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  const secureProtocol = websocket ? "wss:" : "https:";
  const localProtocol = websocket ? "ws:" : "http:";
  if (endpoint.protocol !== secureProtocol && !(loopback && endpoint.protocol === localProtocol)) {
    throw new Error(websocket ? "实时语音服务必须使用 WSS；本机可使用 WS localhost" : "文本模型服务必须使用 HTTPS；本机可使用 HTTP localhost");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("服务地址不能包含用户名、密码、查询参数或锚点");
  if (!websocket && !endpoint.pathname.replace(/\/$/, "").endsWith("/chat/completions")) throw new Error("文本模型地址必须是完整的 /chat/completions 端点");
  return endpoint.href.replace(/\/$/, "");
}

function normalizeTextConfig(value = {}) {
  const provider = TEXT_PROVIDERS.has(value.provider) ? value.provider : "custom";
  return {
    provider,
    endpoint: validateEndpoint(value.endpoint),
    model: cleanText(value.model, "模型名称", { required: true, maxLength: 120 }),
    apiKey: validateSecret(value.apiKey),
  };
}

function normalizeRealtimeConfig(value = {}) {
  const provider = REALTIME_PROVIDERS.has(value.provider) ? value.provider : "custom";
  return {
    provider,
    endpoint: validateEndpoint(value.endpoint, { websocket: true }),
    appId: cleanText(value.appId, "App ID", { required: true, maxLength: 160 }),
    accessKey: validateSecret(value.accessKey, "Access Key"),
    appKey: provider === "doubao" ? "" : cleanText(value.appKey, "App Key", { maxLength: 240 }),
    resourceId: cleanText(value.resourceId, "Resource ID", { required: true, maxLength: 160 }),
    model: cleanText(value.model, "实时语音模型", { required: true, maxLength: 120 }),
    voice: cleanText(value.voice, "音色", { required: true, maxLength: 160 }),
  };
}

function createSecureAiServiceStore({ safeStorage, userDataPath }) {
  const filePath = path.join(userDataPath, "ai-service-credentials.json");
  const read = () => {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return { version: 1 }; }
  };
  const write = (value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  };
  const encrypted = (value) => safeStorage.encryptString(value).toString("base64");
  const decrypted = (value) => safeStorage.decryptString(Buffer.from(value, "base64"));
  const status = () => {
    const value = read();
    return {
      storage: safeStorage.isEncryptionAvailable() ? "windows-encrypted" : "unavailable",
      text: value.text ? { configured: true, provider: value.text.provider, endpoint: value.text.endpoint, model: value.text.model } : { configured: false, provider: "bailian", endpoint: "", model: "qwen3.7-flash" },
      realtime: value.realtime ? { configured: true, provider: value.realtime.provider, endpoint: value.realtime.endpoint, resourceId: value.realtime.resourceId, model: value.realtime.model, voice: value.realtime.voice } : { configured: false, provider: "doubao", endpoint: "", resourceId: "volc.speech.dialog", model: "", voice: "" },
    };
  };
  const saveText = (input) => {
    requireEncryption(safeStorage);
    const config = normalizeTextConfig(input);
    const value = read();
    value.version = 1;
    value.text = { ...config, apiKey: encrypted(config.apiKey) };
    write(value);
    return status();
  };
  const saveRealtime = (input) => {
    requireEncryption(safeStorage);
    const config = normalizeRealtimeConfig(input);
    const value = read();
    value.version = 1;
    value.realtime = { ...config, appId: encrypted(config.appId), accessKey: encrypted(config.accessKey), appKey: config.appKey ? encrypted(config.appKey) : "" };
    write(value);
    return status();
  };
  const loadTextSecret = () => {
    const value = read().text;
    if (!value?.apiKey) throw new Error("请先配置文本大模型服务");
    requireEncryption(safeStorage);
    return { ...value, apiKey: decrypted(value.apiKey) };
  };
  const loadRealtimeSecret = () => {
    const value = read().realtime;
    if (!value?.accessKey) throw new Error("请先配置实时语音服务");
    requireEncryption(safeStorage);
    return { ...value, appId: decrypted(value.appId), accessKey: decrypted(value.accessKey), appKey: value.appKey ? decrypted(value.appKey) : "" };
  };
  const clear = (key) => {
    const value = read();
    delete value[key];
    if (value.text || value.realtime) write(value);
    else { try { fs.rmSync(filePath); } catch (error) { if (error.code !== "ENOENT") throw error; } }
    return status();
  };
  return { clearRealtime: () => clear("realtime"), clearText: () => clear("text"), loadRealtimeSecret, loadTextSecret, saveRealtime, saveText, status };
}

module.exports = { createSecureAiServiceStore, normalizeRealtimeConfig, normalizeTextConfig, validateEndpoint, validateSecret };
