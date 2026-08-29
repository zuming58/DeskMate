import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages.jsx", import.meta.url), "utf8");

test("primary navigation stays limited to the six daily workflows", () => {
  const navigationBlock = appSource.match(/const navigation = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const labels = [...navigationBlock.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["工作台", "语音输入", "陪伴", "历史记录", "词库", "按键配置"]);
});

test("consolidated companion hub preserves the low-frequency routes", () => {
  for (const route of ["connections", "agents", "expressions", "editor", "motion", "sensors", "settings"]) {
    assert.match(appSource, new RegExp(`\\b${route}: \\w+Page`));
  }
  assert.match(pageSource, /原功能统一入口/);
  assert.match(pageSource, /navigate\("expressions"\)/);
});

test("companion preview is explicit about simulated and pending capabilities", () => {
  assert.match(pageSource, /当前不会采集或上传语音/);
  assert.match(pageSource, /尚未写入长期记忆/);
  assert.match(pageSource, /仅更新软件表情预览；未发送到小智/);
  assert.match(pageSource, /deskmate-face-large-eyes\.png/);
});
