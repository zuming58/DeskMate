const { createHash } = require("crypto");
const net = require("net");

const DEFAULT_AUDIO_PORT = 17333;

function networkCategory(name) {
  if (/wi-?fi|wireless|wlan/i.test(name)) return "Wi-Fi";
  if (/ethernet|lan|以太网/i.test(name)) return "以太网";
  return "网络";
}

function listAudioNetworkAdapters(interfaces = {}) {
  const counts = new Map();
  const adapters = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      const family = entry.family === 4 ? "IPv4" : entry.family;
      if (entry.internal || family !== "IPv4" || net.isIPv4(entry.address) === 0) continue;
      const category = networkCategory(name);
      const index = (counts.get(category) || 0) + 1;
      counts.set(category, index);
      const id = createHash("sha256").update(`${name}\0${entry.address}\0${entry.netmask || ""}`, "utf8").digest("hex").slice(0, 16);
      adapters.push(Object.freeze({ id, label: `${category} ${index}`, address: entry.address }));
    }
  }
  return adapters;
}

function validateAudioSetupInput(value = {}, adapters = []) {
  const ssid = String(value.ssid || "");
  const password = String(value.password || "");
  const adapterId = String(value.adapterId || "");
  const port = Number(value.port ?? DEFAULT_AUDIO_PORT);
  if (!ssid.trim() || Buffer.byteLength(ssid, "utf8") > 32 || /[\u0000-\u001f\u007f]/.test(ssid)) throw new Error("audio-setup-ssid-invalid");
  if (Buffer.byteLength(password, "utf8") > 64 || /[\u0000\r\n]/.test(password)) throw new Error("audio-setup-password-invalid");
  const adapter = adapters.find((item) => item.id === adapterId);
  if (!adapter) throw new Error("audio-setup-adapter-invalid");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("audio-setup-port-invalid");
  return Object.freeze({ ssid, password, adapterId, adapterLabel: adapter.label, address: adapter.address, port });
}

function mergeAudioSetupPatch(raw, input) {
  if (!raw || raw.schema !== "ai_keyboard.v1" || !input || net.isIPv4(input.address) === 0) throw new Error("audio-setup-config-invalid");
  const merged = structuredClone(raw);
  merged.wifi_ssid = input.ssid;
  merged.wifi_password = input.password;
  merged.audio_host = input.address;
  merged.audio_port = input.port;
  return merged;
}

function sanitizeAudioSetup(raw, adapters = []) {
  const port = Number(raw?.audio_port);
  const adapter = adapters.find((item) => item.address === raw?.audio_host);
  const ssidConfigured = typeof raw?.wifi_ssid === "string" && raw.wifi_ssid.length > 0 && Buffer.byteLength(raw.wifi_ssid, "utf8") <= 32;
  const passwordConfigured = typeof raw?.wifi_password === "string" && Buffer.byteLength(raw.wifi_password, "utf8") <= 64;
  const portConfigured = Number.isInteger(port) && port >= 1024 && port <= 65535;
  return Object.freeze({
    configured: Boolean(ssidConfigured && passwordConfigured && adapter && portConfigured),
    ssidConfigured,
    passwordConfigured,
    hostConfigured: Boolean(adapter),
    port: portConfigured ? port : DEFAULT_AUDIO_PORT,
    adapterId: adapter?.id || "",
    adapterLabel: adapter?.label || "",
  });
}

function sanitizedAudioSetupDiff(before, after, adapterLabel) {
  const diff = [];
  if (before?.wifi_ssid !== after?.wifi_ssid) diff.push({ path: "/wifi_ssid", change: "updated" });
  if (before?.wifi_password !== after?.wifi_password) diff.push({ path: "/wifi_password", change: "updated" });
  if (before?.audio_host !== after?.audio_host) diff.push({ path: "/audio_host", change: "updated", adapter: adapterLabel });
  if (before?.audio_port !== after?.audio_port) diff.push({ path: "/audio_port", before: Number(before?.audio_port) || null, after: after.audio_port });
  return diff;
}

module.exports = { DEFAULT_AUDIO_PORT, listAudioNetworkAdapters, mergeAudioSetupPatch, sanitizeAudioSetup, sanitizedAudioSetupDiff, validateAudioSetupInput };
