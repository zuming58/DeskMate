import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildPersonaInstructions,
  companionIdentityAnswer,
  explicitProfileAnswer,
  normalizeCompanionEmbodiment,
} = require("../electron/companion-persona.cjs");
const { CompanionIntentBridge } = require("../electron/companion-intent-bridge.cjs");
const { OpenAiStreamingCompanionModelAdapter } = require("../electron/companion-model-adapter.cjs");

const config = { provider: "bailian", apiKey: "test-key", workspaceId: "" };

test("T48 freezes the product identity while keeping runtime embodiment truthful", () => {
  const connected = { easyInputState: "connected", xiaozhiState: "connected", motionState: "ready" };
  const prompt = buildPersonaInstructions({
    name: "小岚",
    persona: { role: "用户自定义工作搭档", traits: "温柔", speakingStyle: "简短", boundaries: "不编造" },
    embodimentContext: connected,
  });
  assert.match(prompt, /有可选实体形态的 DeskMate 桌面 AI 陪伴伙伴/);
  assert.match(prompt, /小智云台是你的可选实体表现身体/);
  assert.match(prompt, /屏幕承载表情，两个舵机支持左右转动和上下点头/);
  assert.match(prompt, /具体动作是否完成仍以每次真实回执为准/);
  assert.ok(prompt.indexOf("固定身份") > prompt.indexOf("用户自定义工作搭档"));
  assert.ok(prompt.indexOf("安全边界优先于人设") > prompt.indexOf("固定身份"));
  assert.deepEqual(normalizeCompanionEmbodiment({ xiaozhiState: "invented", motionState: "ready" }), {
    version: 1,
    easyInputState: "unknown",
    xiaozhiState: "unknown",
    motionState: "ready",
  });
});

test("T48 answers self-identity questions deterministically from the live hardware policy", async () => {
  const disabled = { easyInputState: "connected", xiaozhiState: "disabled", motionState: "disabled" };
  const answer = explicitProfileAnswer("小智云台它算什么呀？", {}, "小岚", disabled);
  assert.equal(answer.type, "companion-identity");
  assert.match(answer.answer, /^我是小岚/);
  assert.match(answer.answer, /屏幕是我的表情/);
  assert.match(answer.answer, /小智硬件扩展已关闭/);
  assert.doesNotMatch(answer.answer, /已经点头|已经跳舞/);

  let classifierCalls = 0;
  const bridge = new CompanionIntentBridge({
    appActions: { listRegistered: () => [] },
    readPersona: () => ({ name: "小岚", persona: {}, embodiment: disabled }),
    requestJson: async () => { classifierCalls += 1; return { type: "none" }; },
  });
  assert.equal(bridge.claimsTurn("你是不是一个语音助手？"), true);
  const result = await bridge.analyze("你是不是一个语音助手？");
  assert.equal(result.result.field, "companion-identity");
  assert.match(result.result.answer, /桌面 AI 陪伴伙伴/);
  assert.equal(classifierCalls, 0);
});

test("T48 refreshes embodiment state per model turn and invalidates a stale speculative draft", async () => {
  let embodiment = { easyInputState: "connected", xiaozhiState: "connected", motionState: "ready" };
  const adapter = new OpenAiStreamingCompanionModelAdapter({
    config,
    name: "小岚",
    readEmbodimentContext: () => embodiment,
    fetchImpl: async () => { throw new Error("not-called"); },
  });
  const draft = adapter.prepareDraft("今天怎么样");
  const connectedMessages = await adapter.messages("你是谁", new AbortController().signal);
  assert.match(connectedMessages[0].content, /动作链处于就绪状态/);

  embodiment = { easyInputState: "connected", xiaozhiState: "enabled-disconnected", motionState: "unavailable" };
  const disconnectedMessages = await adapter.messages("你是谁", new AbortController().signal);
  assert.match(disconnectedMessages[0].content, /已启用但没有连接/);
  assert.equal(draft.commit(), false);
  adapter.close();
});

test("T48 wires only a sanitized runtime embodiment projection and explains it in the persona UI", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(main, /function companionEmbodimentContext\(\)/);
  assert.match(main, /readEmbodimentContext: \(\) => companionEmbodimentContext\(\)/);
  assert.match(main, /easyInputState, xiaozhiState, motionState/);
  assert.doesNotMatch(companionIdentityAnswer("小岚", {}), /路径|序列号|MAC|IP/);
  assert.match(page, /内置身份 · 桌面 AI 陪伴伙伴/);
  assert.match(page, /这层身份会随真实硬件状态更新，不会被自定义人设覆盖/);
});
