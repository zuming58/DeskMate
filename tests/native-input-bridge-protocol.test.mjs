import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = path.join(root, "native", "DeskMate.InputBridge", "DeskMate.InputBridge.csproj");

test("native bridge accepts multi-chunk Maker status and DeskMate config envelopes", () => {
  const result = spawnSync("dotnet", ["run", "--project", project, "--configuration", "Release", "--", "--protocol-self-test"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, `native protocol self-test failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
});

test("native status stream bounds match the firmware 1536-byte contract", () => {
  const protocol = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "VendorReportProtocol.cs"), "utf8");
  assert.match(protocol, /StatusStreamMaxBytes = 1536;/);
  assert.match(protocol, /StatusStreamMaxChunks = 31;/);
  assert.match(protocol, /new string\('x', 1104\)/);
  assert.match(protocol, /new string\('x', 1535\)/);
  assert.match(protocol, /HasValidStreamBounds\(StatusStreamKind, StatusStreamMaxChunks, StatusStreamMaxBytes\)/);
  assert.match(protocol, /StatusStreamMaxChunks \+ 1, 1104/);
  assert.match(protocol, /StatusStreamMaxBytes \+ 1/);
  assert.doesNotMatch(protocol, /StatusStreamMaxBytes = 1023;/);
  assert.doesNotMatch(protocol, /StatusStreamMaxChunks = 21;/);
});

test("Raw Input production path uses the shared vendor envelope validator", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /if \(!VendorReportProtocol\.HasValidEnvelope\(report\)\) return;/);
  assert.doesNotMatch(source, /kind != 0x06 && \(report\[2\] != 0 \|\| report\[3\] != 1\)/);
});

test("native fixed-text path is bounded, private, and main-process authorized", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  const protocol = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "VendorReportProtocol.cs"), "utf8");
  assert.match(source, /type\.GetString\(\) != "sync-config".*type\.GetString\(\) != "read-config".*type\.GetString\(\) != "inject-fixed-text"/s);
  assert.equal(source.includes("GetForegroundWindow()"), true);
  assert.equal(source.includes("foregroundProcessId == blockedProcessId"), true);
  assert.equal(source.includes("blockedWindows.Contains(foreground)"), true);
  assert.equal(source.includes("fixed-text-send-input-incomplete"), true);
  assert.match(source, /public void FixedTextReady\(string requestId, int bytes\)/);
  assert.doesNotMatch(source, /FixedTextReady\(string requestId, string text/);
  assert.equal(protocol.includes("_bytes.Count + length > 960"), true);
  assert.equal(protocol.includes("TimeSpan.FromSeconds(3)"), true);
  assert.equal(protocol.includes("ContainsAnyExcept((byte)0)"), true);
  assert.match(protocol, /hostActionWithPadding\[41\] = 1/);
  assert.match(protocol, /duplicateFirst\.Accept\(first, out _\).*?!duplicateFirst\.Accept\(first, out _\).*?!duplicateFirst\.Accept\(last, out _\)/s);
  assert.match(protocol, /invalidPadding\[6\] = 1/);
  assert.match(protocol, /invalidUtf8\[5\] = 0xc3/);
  assert.match(protocol, /if \(_next != 0\).*?ResetActive\(\);.*?return false;/s);
});

test("native agent-state writer validates the frozen report before HidD_SetFeature", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  const protocol = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "VendorReportProtocol.cs"), "utf8");
  assert.match(source, /commandType == "set-agent-state"/);
  assert.match(source, /VendorReportProtocol\.IsValidAgentStateReport\(report\)/);
  assert.match(source, /WriteAgentStateReport\(byte\[\] report\)/);
  assert.match(source, /HidD_SetFeature\(handle, report, report\.Length\)/);
  assert.match(protocol, /report\.Length != 64 \|\| report\[0\] != 0x12 \|\| report\[1\] != 2/);
  assert.match(protocol, /report\.Slice\(17\)\.ContainsAnyExcept\(\(byte\)0\)/);
});

test("native active-window paste validates the exact target and releases modifiers on failure", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /commandType == "paste-active-window"/);
  assert.match(source, /foreground != expectedWindow/);
  assert.match(source, /NativeInput\.Key\(VkControl, false\).*NativeInput\.Key\(VkV, false\).*NativeInput\.Key\(VkV, true\).*NativeInput\.Key\(VkControl, true\)/s);
  assert.match(source, /desktop-output-send-input-incomplete/);
  assert.doesNotMatch(source, /PasteActiveWindow\([^)]*text/i);
});

test("native target capture returns a handle without window metadata", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /commandType == "capture-active-window"/);
  assert.match(source, /CaptureActiveWindow\(\)/);
  assert.match(source, /DesktopWindowResult\(string requestId, bool ok, string reason, string targetWindow\)/);
  assert.doesNotMatch(source, /DesktopWindowResult\([^)]*(title|path)/i);
});

test("native keyboard hook reports Ctrl+Shift+E only after the chord is released", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /value\.VirtualKey is VkControl or VkLControl or VkRControl/);
  assert.match(source, /value\.VirtualKey is VkShift or VkLShift or VkRShift/);
  assert.match(source, /_writer\.Input\("keyboard", "VoiceEdit", "down"\)/);
  assert.match(source, /isUp && _hookVoiceEditDown[\s\S]*?_writer\.Input\("keyboard", "VoiceEdit", "up"\)/);
  assert.doesNotMatch(source, /return new IntPtr\(1\)/);
});
