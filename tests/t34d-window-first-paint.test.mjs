import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");

test("main window waits for its first renderer frame instead of exposing a white launch surface", () => {
  const createWindow = main.slice(main.indexOf("function createWindow()"), main.indexOf("function startInputBridge()"));
  assert.match(createWindow, /show:\s*false/);
  assert.match(createWindow, /backgroundColor:\s*"#f4f7fb"/);
  assert.match(createWindow, /mainWindow\.once\("ready-to-show"/);
  assert.match(createWindow, /mainWindow\.show\(\)/);
});

test("tray and second-instance restore also wait while the main frame is loading", () => {
  const showMain = main.slice(main.indexOf("function showMain(route)"), main.indexOf("function refreshTrayMenu()"));
  assert.match(showMain, /webContents\.isLoadingMainFrame\(\)/);
  assert.match(showMain, /mainWindow\.once\("ready-to-show", reveal\)/);
  assert.match(showMain, /if \(mainWindow\.isMinimized\(\)\) mainWindow\.restore\(\)/);
});

test("the packaged build identifies the current integrated desktop slice", () => {
  assert.match(main, /DESKMATE_BUILD_ID = "t57-reminder-purpose-delete"/);
});

test("the packaged smoke test reads the main-owned history store after migration", () => {
  assert.match(main, /localHistoryService\.call\("list", \{ limit: 1 \}\)/);
  assert.match(main, /report\.historyText = latestHistory\?\.text \|\| ""/);
});
