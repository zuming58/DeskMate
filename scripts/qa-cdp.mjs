import fs from "node:fs/promises";
import path from "node:path";

const endpoint = "http://127.0.0.1:9222";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === "page" && /(?:localhost|127\.0\.0\.1):4174/.test(item.url));
      if (target) return target;
    } catch {
      // Browser is still starting.
    }
    await delay(200);
  }
  throw new Error("Could not find the DeskMate browser target");
}

const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") exceptions.push(message.params.entry.text);
});

function send(method, params = {}) {
  requestId += 1;
  const id = requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await send("Runtime.enable");
await send("Log.enable");
const checks = [];
const check = (name, passed, detail = "") => checks.push({ name, passed: Boolean(passed), detail });

check("app shell renders", await evaluate("Boolean(document.querySelector('.app-shell'))"));
check("seven navigation items render", (await evaluate("document.querySelectorAll('.sidebar__nav button').length")) === 7);

await evaluate("location.hash='#/voice'");
await delay(350);
check("voice route opens", (await evaluate("document.querySelector('h1')?.textContent")) === "语音输入");

await evaluate("location.hash='#/history'");
await delay(250);
check("history records render", (await evaluate("document.querySelectorAll('.history-item').length")) >= 4);
await evaluate("document.querySelector('.history-item .icon-button')?.click()");
await delay(120);
check("history action shows feedback", await evaluate("Boolean(document.querySelector('.toast'))"));

await evaluate("location.hash='#/keymap'");
await delay(250);
await evaluate("document.querySelectorAll('.hardware-key')[2]?.click()");
check("key selection changes", await evaluate("document.querySelectorAll('.hardware-key')[2]?.classList.contains('is-selected')"));

await evaluate("location.hash='#/companion'");
await delay(250);
await evaluate("[...document.querySelectorAll('.companion-tabs button')].find(b=>b.textContent.includes('表情库'))?.click()");
await delay(250);
await evaluate("document.querySelectorAll('.expression-library .expression-tile')[5]?.click()");
check("expression selection changes", await evaluate("document.querySelectorAll('.expression-library .expression-tile')[5]?.classList.contains('is-selected')"));
await evaluate("[...document.querySelectorAll('.companion-tabs button')].find(b=>b.textContent.includes('记忆管理'))?.click()");
await delay(250);
check("memory management opens honestly", await evaluate("document.querySelector('.memory-management')?.textContent.includes('尚无可管理的记忆')"));

await evaluate("location.hash='#/settings'");
await delay(250);
await evaluate("[...document.querySelectorAll('.settings-nav button')].find(b=>b.textContent.includes('设备连接'))?.click()");
await delay(120);
check("device connections are embedded in settings", await evaluate("Boolean(document.querySelector('.connections-embedded'))"));
await evaluate("[...document.querySelectorAll('.settings-nav button')].find(b=>b.textContent.includes('AI 服务'))?.click()");
await delay(120);
check("AI services expose three isolated planes", await evaluate("document.querySelectorAll('.service-config-block').length === 3"));
await send("Page.enable");
await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then(async ({ data }) => fs.writeFile(path.resolve("design/qa/t07d-ai-services.png"), Buffer.from(data, "base64")));
await evaluate("[...document.querySelectorAll('.settings-nav button')].find(b=>b.textContent.includes('系统诊断'))?.click()");
await delay(120);
check("diagnostics section opens", await evaluate("document.querySelector('.diagnostic-list')?.children.length === 7"));

check("no runtime or browser log errors", exceptions.length === 0, exceptions.join(" | "));
const failed = checks.filter((item) => !item.passed);
console.log(JSON.stringify({ checks, failed, final: failed.length ? "blocked" : "passed" }, null, 2));
socket.close();
if (failed.length) process.exitCode = 1;
