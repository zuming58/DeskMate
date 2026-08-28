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

test("Raw Input production path uses the shared vendor envelope validator", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /if \(!VendorReportProtocol\.HasValidEnvelope\(report\)\) return;/);
  assert.doesNotMatch(source, /kind != 0x06 && \(report\[2\] != 0 \|\| report\[3\] != 1\)/);
});
