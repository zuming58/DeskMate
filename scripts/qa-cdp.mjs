const endpoint = "http://127.0.0.1:9222";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === "page" && item.url.includes("localhost:4173"));
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
check("twelve navigation items render", (await evaluate("document.querySelectorAll('.sidebar__nav button').length")) === 12);

await evaluate("location.hash='#/voice'");
await delay(350);
check("voice route opens", (await evaluate("document.querySelector('h1')?.textContent")) === "语音输入");
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始录音'))?.click()");
await delay(350);
check("recording starts", await evaluate("document.querySelector('.recorder')?.classList.contains('is-recording')"));
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('停止录音'))?.click()");
await delay(250);
check("recording completes with transcript", await evaluate("document.querySelector('.recorder__transcript')?.textContent.includes('软件端')"));

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

await evaluate("location.hash='#/expressions'");
await delay(250);
await evaluate("document.querySelectorAll('.expression-library .expression-tile')[5]?.click()");
check("expression selection changes", await evaluate("document.querySelectorAll('.expression-library .expression-tile')[5]?.classList.contains('is-selected')"));

await evaluate("location.hash='#/motion'");
await delay(250);
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('测试动作'))?.click()");
await delay(120);
check("motion preview starts", await evaluate("document.querySelector('.motion-avatar')?.classList.contains('is-playing')"));

await evaluate("location.hash='#/settings'");
await delay(250);
await evaluate("[...document.querySelectorAll('.settings-nav button')].find(b=>b.textContent.includes('系统诊断'))?.click()");
await delay(120);
check("diagnostics section opens", await evaluate("document.querySelector('.diagnostic-list')?.children.length === 6"));

check("no runtime or browser log errors", exceptions.length === 0, exceptions.join(" | "));
const failed = checks.filter((item) => !item.passed);
console.log(JSON.stringify({ checks, failed, final: failed.length ? "blocked" : "passed" }, null, 2));
socket.close();
if (failed.length) process.exitCode = 1;
