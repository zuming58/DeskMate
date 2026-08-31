const fs = require("fs");
const path = require("path");

function requireEncryption(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) throw new Error("knowledge-base-secure-storage-unavailable");
}

function createKnowledgeBaseSettings({ safeStorage, userDataPath } = {}) {
  const filePath = path.join(userDataPath, "knowledge-base-settings.json");
  const read = () => {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { return { version: 1 }; }
  };
  const write = (value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  };
  const decryptRoot = (value) => {
    requireEncryption(safeStorage);
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  };
  const status = () => {
    const value = read();
    if (!value.root) return { configured: false, storage: safeStorage?.isEncryptionAvailable?.() ? "windows-encrypted" : "unavailable", label: "", projection: "markdown-double-link-v1", embedding: "pending" };
    try {
      const root = decryptRoot(value.root);
      const valid = path.isAbsolute(root) && fs.statSync(root).isDirectory();
      return { configured: valid, storage: "windows-encrypted", label: valid ? path.basename(root) : "", projection: "markdown-double-link-v1", embedding: "pending", reason: valid ? "" : "knowledge-base-location-unavailable" };
    } catch { return { configured: false, storage: "unavailable", label: "", projection: "markdown-double-link-v1", embedding: "pending", reason: "knowledge-base-location-unavailable" }; }
  };
  const saveRoot = (input) => {
    requireEncryption(safeStorage);
    const raw = String(input || "").trim();
    if (!raw || !path.isAbsolute(raw) || /[\u0000-\u001f]/.test(raw)) throw new Error("knowledge-base-location-invalid");
    const root = path.resolve(raw);
    try {
      if (!path.isAbsolute(root) || !fs.statSync(root).isDirectory()) throw new Error("invalid");
      fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
    } catch { throw new Error("knowledge-base-location-unavailable"); }
    write({ version: 1, root: safeStorage.encryptString(root).toString("base64") });
    return status();
  };
  const loadRoot = () => {
    const value = read();
    if (!value.root) throw new Error("knowledge-base-location-not-configured");
    const root = decryptRoot(value.root);
    if (!path.isAbsolute(root) || !fs.statSync(root).isDirectory()) throw new Error("knowledge-base-location-unavailable");
    return root;
  };
  return { loadRoot, saveRoot, status };
}

module.exports = { createKnowledgeBaseSettings };
