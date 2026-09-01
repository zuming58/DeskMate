import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expressionPresets } from "../src/appData.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function source(path) {
  return readFile(join(root, path), "utf8");
}

test("keeps the primary navigation compact and moves companion tools into AI Companion", async () => {
  const app = await source("src/App.jsx");
  const pages = await source("src/pages.jsx");
  const navigationBlock = app.match(/const navigation = \[([\s\S]*?)\n\];/)?.[1] || "";
  const labels = [...navigationBlock.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(labels, ["工作台", "语音输入", "AI 陪伴", "历史记录", "词库", "按键配置", "设备与诊断"]);
  for (const hiddenLabel of ["表情库", "表情编辑", "动作编排", "环境感知", "AI 联动"]) {
    assert.equal(labels.includes(hiddenLabel), false);
  }
  for (const section of ["陪伴与记忆", "记忆管理", "表情库", "动作编排", "AI 联动"]) {
    assert.match(pages, new RegExp(section));
  }
  assert.match(pages, /id: "connections".*label: "设备连接"/);
  assert.match(pages, /<ConnectionsPage notify=\{notify\} embedded/);
});

test("ships the complete seven-state raster expression library", async () => {
  const face = await source("src/CompanionFace.jsx");
  const expected = [
    ["focus", "idle.png"],
    ["sleep", "blink.png"],
    ["happy", "happy.png"],
    ["sad", "sad.png"],
    ["alert", "angry.png"],
    ["think", "thinking.png"],
    ["listen", "listening.png"],
  ];

  assert.equal(expressionPresets.length, 7);
  assert.deepEqual(expressionPresets.map((preset) => preset.id), expected.map(([id]) => id));
  for (const [id, filename] of expected) {
    assert.match(face, new RegExp(`${id}:.*${filename.replace(".", "\\.")}`));
    const asset = await stat(join(root, "public", "assets", "expressions", filename));
    assert.equal(asset.isFile(), true);
    assert.ok(asset.size > 10_000, `${filename} should contain a real raster asset`);
  }
});

test("natural blinking is bounded and respects reduced-motion preference", async () => {
  const face = await source("src/CompanionFace.jsx");
  assert.match(face, /prefers-reduced-motion: reduce/);
  assert.match(face, /4200 \+ Math\.round\(Math\.random\(\) \* 3600\)/);
  assert.match(face, /}, 150\);/);
  assert.match(face, /clearTimeout\(blinkTimer\)/);
  assert.match(face, /clearTimeout\(resetTimer\)/);
});

test("companion UI is a real main-process session entry and does not create a renderer microphone workflow", async () => {
  const app = await source("src/App.jsx");
  const pages = await source("src/pages.jsx");
  const preload = await source("electron/preload.cjs");
  const companion = pages.slice(pages.indexOf("export function CompanionPage"), pages.indexOf("export function DashboardPage"));
  assert.match(companion, /deviceServiceStatus/);
  assert.match(companion, /serviceStatus\.microphone\.label/);
  assert.doesNotMatch(companion, /T10E 待接入|等待 T10E 音频/);
  assert.match(companion, /startCompanionConversation/);
  assert.match(companion, /唯一前台会话仲裁器/);
  assert.match(preload, /startCompanionConversation: \(value\) => ipcRenderer\.invoke\("companion:start", value\)/);
  assert.match(preload, /interruptCompanionConversation/);
  assert.match(app, /createComputerCompanionAudioEngine/);
  assert.match(preload, /onCompanionConversationEvent/);
  assert.doesNotMatch(companion, /getUserMedia|MediaRecorder|useRecorder/);
  assert.match(pages, /未发送到小智舵机/);
});
