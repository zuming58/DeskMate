import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  companionExhibitionIntroduction,
  explicitProfileAnswer,
  isCompanionExhibitionIntroductionQuery,
} = require("../electron/companion-persona.cjs");
const { CompanionIntentBridge } = require("../electron/companion-intent-bridge.cjs");

test("T50 recognizes explicit exhibition self-introduction commands without claiming the owner's speech", () => {
  for (const utterance of [
    "小岚小岚，你给大家介绍一下自己吧",
    "介绍一下你自己",
    "小兰，给现场做个自我介绍",
    "请你介绍一下 DeskMate 的功能",
  ]) assert.equal(isCompanionExhibitionIntroductionQuery(utterance), true, utterance);
  assert.equal(isCompanionExhibitionIntroductionQuery("我来给大家介绍一下自己"), false);
  assert.equal(isCompanionExhibitionIntroductionQuery("你是谁"), false);
});

test("T50 introduction is concise, complete and truthful for connected hardware", () => {
  const answer = companionExhibitionIntroduction("小岚", {
    easyInputState: "connected",
    xiaozhiState: "connected",
    motionState: "ready",
  });
  assert.match(answer, /^大家好，我叫小岚/);
  for (const capability of ["连续对话", "本地记忆", "个人提醒", "语音输入", "快捷按键", "提示词切换", "风格映像", "任务和设备状态", "EasyInput"]) {
    assert.match(answer, new RegExp(capability));
  }
  assert.match(answer, /现在小智云台也已连接/);
  assert.match(answer, /屏幕表情、左右转动和上下点头/);
  assert.ok([...answer].length <= 240, `direct speech text is ${[...answer].length} characters`);
});

test("T50 disconnected introduction describes optional embodiment instead of inventing a live connection", () => {
  const profile = explicitProfileAnswer("小岚，给大家介绍一下自己", {}, "小岚", {
    easyInputState: "connected",
    xiaozhiState: "disabled",
    motionState: "disabled",
  });
  assert.equal(profile.type, "companion-exhibition-introduction");
  assert.match(profile.answer, /小智云台是我的可选实体身体，连接后/);
  assert.doesNotMatch(profile.answer, /现在小智云台.*已连接/);
  assert.ok([...profile.answer].length <= 240);
});

test("T50 routes the introduction locally before the model classifier", async () => {
  let classifierCalls = 0;
  const bridge = new CompanionIntentBridge({
    appActions: { listRegistered: () => [] },
    readPersona: () => ({
      name: "小岚",
      persona: {},
      embodiment: { easyInputState: "connected", xiaozhiState: "connected", motionState: "ready" },
    }),
    requestJson: async () => { classifierCalls += 1; return { type: "none" }; },
  });
  assert.equal(bridge.claimsTurn("小岚小岚，你给大家介绍一下自己吧"), true);
  const result = await bridge.analyze("小岚小岚，你给大家介绍一下自己吧");
  assert.equal(result.result.type, "query_companion_profile");
  assert.equal(result.result.field, "companion-exhibition-introduction");
  assert.match(result.result.answer, /风格映像/);
  assert.equal(classifierCalls, 0);
});
