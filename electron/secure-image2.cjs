const fs = require("fs");
const path = require("path");
const { writePrivateJson } = require('./atomic-private-json.cjs');

const DEFAULT_IMAGE2_BASE_URL = "https://metajing.cn/v1";
const IMAGE2_MODEL = "gpt-image-2";

function requireEncryption(safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储当前不可用，未保存 Image 2 密钥");
}

function validateImage2ApiKey(value) {
  const secret = String(value || "").trim();
  if (secret.length < 8 || secret.length > 512 || /\s|[\u0000-\u001f]/.test(secret)) throw new Error("Image 2 API Key 格式无效");
  return secret;
}

function normalizeImage2BaseUrl(value) {
  let url;
  try { url = new URL(String(value || DEFAULT_IMAGE2_BASE_URL).trim()); }
  catch { throw new Error("Image 2 服务地址格式无效"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw new Error("Image 2 服务必须使用 HTTPS；本机测试可使用 HTTP localhost");
  if (url.username || url.password || url.search || url.hash) throw new Error("Image 2 服务地址不能包含用户名、密码、查询参数或锚点");
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/images/generations") ? pathname.slice(0, -"/images/generations".length) || "/" : pathname || "/";
  return url.href.replace(/\/$/, "");
}

function createSecureImage2Store({ safeStorage, userDataPath }) {
  const filePath = path.join(userDataPath, "image2-credentials.json");
  const read = () => {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { return {}; }
  };
  const status = () => {
    const value = read();
    return {
      configured: Boolean(value.apiKey),
      provider: "metajing",
      baseUrl: value.baseUrl || DEFAULT_IMAGE2_BASE_URL,
      model: IMAGE2_MODEL,
      timeoutSeconds: 1200,
      storage: safeStorage.isEncryptionAvailable() ? "windows-encrypted" : "unavailable",
    };
  };
  const save = ({ apiKey, baseUrl = DEFAULT_IMAGE2_BASE_URL } = {}) => {
    requireEncryption(safeStorage);
    const value = {
      version: 1,
      provider: "metajing",
      baseUrl: normalizeImage2BaseUrl(baseUrl),
      model: IMAGE2_MODEL,
      apiKey: safeStorage.encryptString(validateImage2ApiKey(apiKey)).toString("base64"),
    };
    writePrivateJson(filePath, value);
    return status();
  };
  const loadSecret = () => {
    const value = read();
    if (!value.apiKey) throw new Error("请先在设置页配置 Image 2 生图服务");
    requireEncryption(safeStorage);
    return {
      provider: "metajing",
      baseUrl: normalizeImage2BaseUrl(value.baseUrl || DEFAULT_IMAGE2_BASE_URL),
      model: IMAGE2_MODEL,
      apiKey: safeStorage.decryptString(Buffer.from(value.apiKey, "base64")),
    };
  };
  const clear = () => {
    try { fs.rmSync(filePath); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    return status();
  };
  return { clear, loadSecret, save, status };
}

module.exports = { DEFAULT_IMAGE2_BASE_URL, IMAGE2_MODEL, createSecureImage2Store, normalizeImage2BaseUrl, validateImage2ApiKey };
