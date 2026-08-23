const fs = require("fs");
const path = require("path");
const { validateApiKey, validateWorkspaceId, DEFAULT_MODEL } = require("./bailian.cjs");

function createSecureBailianStore({ safeStorage, userDataPath }) {
  const filePath = path.join(userDataPath, "bailian-credentials.json");
  const read = () => {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return {}; }
  };
  const status = () => {
    const value = read();
    return { configured: Boolean(value.apiKey), workspaceId: value.workspaceId || "", model: value.model || DEFAULT_MODEL, storage: safeStorage.isEncryptionAvailable() ? "windows-encrypted" : "unavailable" };
  };
  const save = ({ apiKey, workspaceId = "" }) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储当前不可用，未保存 API Key");
    const key = validateApiKey(apiKey);
    const value = { version: 1, apiKey: safeStorage.encryptString(key).toString("base64"), workspaceId: validateWorkspaceId(workspaceId), model: DEFAULT_MODEL };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    return status();
  };
  const loadSecret = () => {
    const value = read();
    if (!value.apiKey) throw new Error("请先在设置页保存百炼 API Key");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储当前不可用");
    return { apiKey: safeStorage.decryptString(Buffer.from(value.apiKey, "base64")), workspaceId: value.workspaceId || "", model: value.model || DEFAULT_MODEL };
  };
  const clear = () => { try { fs.rmSync(filePath); } catch (error) { if (error.code !== "ENOENT") throw error; } return status(); };
  return { clear, loadSecret, save, status };
}

module.exports = { createSecureBailianStore };
