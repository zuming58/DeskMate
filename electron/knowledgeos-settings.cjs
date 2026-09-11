const fs = require("fs");
const path = require("path");

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULTS = Object.freeze({ version: 1, readEnabled: false, syncEnabled: false, credentialId: "", projectId: null, sensitivity: "private" });

function createKnowledgeOsSettings({ safeStorage, userDataPath } = {}) {
  const filePath = path.join(userDataPath, "knowledgeos-settings.json");
  const read = () => {
    try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(filePath, "utf8")) }; }
    catch { return { ...DEFAULTS }; }
  };
  const write = (value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, filePath);
  };
  const decryptCommand = (value) => {
    if (!value?.command || !safeStorage?.isEncryptionAvailable?.()) return "";
    try { return safeStorage.decryptString(Buffer.from(value.command, "base64")); } catch { return ""; }
  };
  const status = () => {
    const value = read();
    const command = decryptCommand(value);
    const commandAvailable = Boolean(command && path.isAbsolute(command) && fs.existsSync(command));
    const credentialConfigured = UUID_V7.test(String(value.credentialId || ""));
    return Object.freeze({
      configured: commandAvailable && credentialConfigured,
      commandConfigured: commandAvailable,
      commandLabel: commandAvailable ? path.basename(command) : "",
      credentialConfigured,
      credentialId: credentialConfigured ? String(value.credentialId) : "",
      readEnabled: value.readEnabled === true,
      syncEnabled: value.syncEnabled === true,
      projectConfigured: value.projectId ? UUID_V7.test(String(value.projectId)) : false,
      projectId: value.projectId && UUID_V7.test(String(value.projectId)) ? String(value.projectId) : null,
      sensitivity: ["private", "sensitive", "restricted"].includes(value.sensitivity) ? value.sensitivity : "private",
    });
  };
  const saveCommand = (command) => {
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error("knowledgeos-secure-storage-unavailable");
    const target = path.resolve(String(command || ""));
    if (!path.isAbsolute(target) || !fs.statSync(target).isFile() || !/knowledgeos.*mcp.*\.exe$/i.test(path.basename(target))) throw new Error("knowledgeos-adapter-invalid");
    write({ ...read(), command: safeStorage.encryptString(target).toString("base64") });
    return status();
  };
  const save = (input = {}) => {
    const credentialId = String(input.credentialId || "").trim().toLowerCase();
    const requestedProjectId = String(input.projectId || "").trim().toLowerCase();
    const projectIdIgnored = Boolean(requestedProjectId && !UUID_V7.test(requestedProjectId));
    const projectId = projectIdIgnored ? null : requestedProjectId || null;
    if (credentialId && !UUID_V7.test(credentialId)) throw new Error("knowledgeos-credential-id-invalid");
    const sensitivity = String(input.sensitivity || "private");
    if (!["private", "sensitive", "restricted"].includes(sensitivity)) throw new Error("knowledgeos-sensitivity-invalid");
    const next = { ...read(), version: 1, credentialId, projectId, sensitivity, readEnabled: input.readEnabled === true, syncEnabled: input.syncEnabled === true };
    write(next);
    return Object.freeze({ ...status(), projectIdIgnored });
  };
  const loadConnection = () => {
    const value = read();
    const command = decryptCommand(value);
    if (!command || !UUID_V7.test(String(value.credentialId || ""))) throw new Error("knowledgeos-not-configured");
    return Object.freeze({ command, credentialId: String(value.credentialId), projectId: UUID_V7.test(String(value.projectId || "")) ? String(value.projectId) : null, sensitivity: status().sensitivity, readEnabled: value.readEnabled === true, syncEnabled: value.syncEnabled === true });
  };
  return { loadConnection, save, saveCommand, status };
}

module.exports = { DEFAULT_KNOWLEDGEOS_SETTINGS: DEFAULTS, UUID_V7, createKnowledgeOsSettings };
