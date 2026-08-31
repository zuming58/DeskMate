import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listAudioNetworkAdapters, mergeAudioSetupPatch, sanitizeAudioSetup, sanitizedAudioSetupDiff, validateAudioSetupInput } = require("../electron/easyinput-audio-setup.cjs");

const interfaces = {
  "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.10.8", netmask: "255.255.255.0" }],
  Ethernet: [{ family: 4, internal: false, address: "10.0.0.8", netmask: "255.0.0.0" }],
  Loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1", netmask: "255.0.0.0" }],
};

test("network choices expose opaque ids and labels, not IP addresses", () => {
  const adapters = listAudioNetworkAdapters(interfaces);
  assert.equal(adapters.length, 2);
  assert.match(adapters[0].id, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(adapters.map(({ id, label }) => ({ id, label }))).includes("192.168"), false);
});

test("audio setup validates input and modifies exactly four top-level fields", () => {
  const adapters = listAudioNetworkAdapters(interfaces);
  const input = validateAudioSetupInput({ ssid: "DeskMate", password: "secret", adapterId: adapters[0].id, port: 17333 }, adapters);
  const original = { schema: "ai_keyboard.v1", wifi_ssid: "old", wifi_password: "old-secret", audio_host: "10.0.0.2", audio_port: 1234, profiles: [{ id: "keep" }], unknown: { preserved: true } };
  const merged = mergeAudioSetupPatch(original, input);
  assert.deepEqual(merged.profiles, original.profiles);
  assert.deepEqual(merged.unknown, original.unknown);
  assert.equal(merged.wifi_ssid, "DeskMate");
  assert.equal(merged.wifi_password, "secret");
  assert.equal(merged.audio_host, "192.168.10.8");
  assert.equal(merged.audio_port, 17333);
  const sanitized = sanitizeAudioSetup(merged, adapters);
  assert.equal(sanitized.configured, true);
  assert.equal(JSON.stringify(sanitized).includes("192.168"), false);
  assert.equal(JSON.stringify(sanitized).includes("secret"), false);
  assert.deepEqual(sanitizedAudioSetupDiff(original, merged, input.adapterLabel).map((item) => item.path), ["/wifi_ssid", "/wifi_password", "/audio_host", "/audio_port"]);
});

test("audio setup rejects loopback, invalid port, controls and unknown adapters", () => {
  const adapters = listAudioNetworkAdapters(interfaces);
  assert.throws(() => validateAudioSetupInput({ ssid: "x\n", adapterId: adapters[0].id, port: 17333 }, adapters), /ssid-invalid/);
  assert.throws(() => validateAudioSetupInput({ ssid: "x", adapterId: "missing", port: 17333 }, adapters), /adapter-invalid/);
  assert.throws(() => validateAudioSetupInput({ ssid: "x", adapterId: adapters[0].id, port: 80 }, adapters), /port-invalid/);
  assert.equal(sanitizeAudioSetup({ schema: "ai_keyboard.v1", wifi_ssid: "x", wifi_password: "", audio_host: "192.168.10.8", audio_port: 80 }, adapters).configured, false);
});
