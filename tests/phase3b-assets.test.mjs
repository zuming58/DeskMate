import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("Windows application and tray icons are real checked-in assets", () => {
  const appIcon = path.join(root, "electron", "assets", "tray-icon.ico");
  const trayIcon = path.join(root, "electron", "assets", "tray-icon.ico");
  const trayPng = path.join(root, "electron", "assets", "tray-icon.png");
  for (const file of [appIcon, trayIcon, trayPng]) assert.ok(fs.statSync(file).size > 256, `${file} must not be empty`);
  const header = fs.readFileSync(appIcon).subarray(0, 6);
  assert.equal(header.readUInt16LE(0), 0);
  assert.equal(header.readUInt16LE(2), 1);
  assert.ok(header.readUInt16LE(4) >= 8);
});

test("desktop package declares the formal icon and bundled fallbacks", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.build.appId, "com.deskmate.app");
  assert.equal(pkg.build.win.icon, "electron/assets/tray-icon.ico");
  assert.ok(pkg.build.extraResources.some((item) => item.from === "electron/assets" && item.to === "app-assets"));
});
