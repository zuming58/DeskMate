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

  assert.deepEqual(labels, ["工作台", "语音输入", "AI 陪伴", "历史记录", "词库", "按键配置", "设备连接", "设备与诊断"]);
  for (const hiddenLabel of ["表情库", "表情编辑", "动作编排", "环境感知", "AI 联动"]) {
    assert.equal(labels.includes(hiddenLabel), false);
  }
  for (const section of ["陪伴与记忆", "表情库", "动作编排", "AI 联动"]) {
    assert.match(pages, new RegExp(section));
  }
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

test("companion previews stay honest and do not create a second microphone workflow", async () => {
  const pages = await source("src/pages.jsx");
  const companion = pages.slice(pages.indexOf("export function CompanionPage"), pages.indexOf("export function DashboardPage"));
  assert.match(companion, /软件预览 · 小智待接入/);
  assert.match(companion, /实时语音桥待接入/);
  assert.match(companion, /不会启动第二套麦克风流程/);
  assert.doesNotMatch(companion, /getUserMedia|MediaRecorder|useRecorder/);
  assert.match(pages, /未发送到小智舵机/);
});
