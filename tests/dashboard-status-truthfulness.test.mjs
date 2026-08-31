import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dashboardHardwareStatus, formatDashboardDate } from "../src/domain/dashboardStatus.js";

test("dashboard never infers Xiaozhi health from EasyInput HID presence", () => {
  const disconnected = dashboardHardwareStatus({
    boardConnected: false,
    linkDiagnostics: { state: "connected", rxFrames: 9, txFrames: 8 },
  });
  assert.equal(disconnected.boardConnected, false);
  assert.equal(disconnected.badge, "硬件状态未确认");
  assert.match(disconnected.summary, /不可确认/);

  const unavailable = dashboardHardwareStatus({ boardConnected: true });
  assert.equal(unavailable.boardConnected, true);
  assert.equal(unavailable.link.status, "unavailable");
  assert.match(unavailable.summary, /不可读取/);
  assert.notEqual(unavailable.tone, "success");
});

test("dashboard exposes only the bounded Link state as hardware evidence", () => {
  const expected = {
    connected: ["success", "小智 Link 已连接"],
    waiting: ["warning", "小智 Link 等待连接"],
    faulted: ["warning", "小智 Link 故障"],
    disabled: ["neutral", "小智 Link 未启用"],
  };
  for (const [state, [tone, badge]] of Object.entries(expected)) {
    const status = dashboardHardwareStatus({ boardConnected: true, linkDiagnostics: { state } });
    assert.equal(status.link.status, state);
    assert.equal(status.tone, tone);
    assert.equal(status.badge, badge);
  }
});

test("workbench labels previews and pending hardware without fabricated readings", async () => {
  const page = await readFile(new URL("../src/pages.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const dashboard = page.slice(page.indexOf("export function DashboardPage"), page.indexOf("export function VoicePage"));

  for (const copy of [
    "桌宠软件预览",
    "软件预览 ·",
    "舵机未启用 · 待校准",
    "温度待接入",
    "湿度待接入",
    "环境光待接入",
    "查看系统诊断",
  ]) assert.match(dashboard, new RegExp(copy));

  for (const fabricated of ["24.6℃", "46%", "68%", "正对用户 · 0°", "状态同步正常 · 2 秒前", "智能联动模式已启用"]) {
    assert.doesNotMatch(dashboard, new RegExp(fabricated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(dashboard, /previewSoftwareExpression/);
  assert.doesNotMatch(dashboard, /onClick=\{\(\) => event\(/);
  assert.match(app, /formatDashboardDate\(\)/);
  assert.doesNotMatch(app, /8月20日 · 周四/);
});

test("dashboard date is derived from local time instead of a fixed fixture", () => {
  assert.equal(formatDashboardDate(new Date(2026, 8, 1)), "9月1日 · 周二");
  assert.equal(formatDashboardDate("not-a-date"), "日期不可用");
});
