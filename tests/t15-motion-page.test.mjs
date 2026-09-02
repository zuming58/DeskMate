import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
const adapters = fs.readFileSync(new URL("../src/adapters/voiceAdapters.js", import.meta.url), "utf8");

test("T15 motion page exposes only bounded real presets and endpoint controls", () => {
  assert.match(page, /runPreset\(\{ preset: nextPreset, repeat: nextRepeat, source: "UI" \}\)/);
  for (const preset of ["attention", "nod", "search", "dance"]) assert.match(page, new RegExp(`runPreset\\("${preset}"\\)`));
  assert.match(page, /停止并回中/);
  assert.match(page, /立即急停/);
  assert.match(page, /解除急停并回中/);
  assert.doesNotMatch(page.slice(page.indexOf("export function MotionPage"), page.indexOf("export function SensorsPage")), /动作速度|运动范围|柔性起停/);
});

test("T15 renderer adapter uses semantic operations without motion primitives", () => {
  assert.match(adapters, /getMotionStatus\(\)/);
  assert.match(adapters, /runPreset\(value\)/);
  assert.match(adapters, /stopAndCenter/);
  assert.match(adapters, /emergencyStop/);
  assert.match(adapters, /clearEmergencyStopAndCenter/);
  assert.doesNotMatch(adapters, /setMotionPwm|setServoAngle|writeGpio|pulseWidth/);
});

test("T15 UI keeps endpoint completion separate from physical HIL", () => {
  assert.match(page, /端点报告本次动作已完成/);
  assert.match(page, /是否真实转动、方向和机械回中仍以你现场观察为准/);
  assert.match(page, /自动动作暂未开放/);
});
