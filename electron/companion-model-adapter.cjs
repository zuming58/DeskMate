const { endpointForWorkspace } = require("./bailian.cjs");
const { buildPersonaInstructions } = require("./companion-persona.cjs");
const { cleanVisibleText } = require("./companion-speech-segmenter.cjs");

const DEFAULT_COMPANION_MODEL = "qwen3.7-flash";
const MAX_HISTORY_TURNS = 12;

function stableModelError(reason = "three-stage-model-unavailable") {
  return new Error(/^three-stage-[a-z-]+$/.test(String(reason || "")) ? reason : "three-stage-model-unavailable");
}

function normalizedModelConfig(value = {}) {
  const provider = String(value.provider || "bailian");
  if (!String(value.apiKey || "").trim()) throw stableModelError();
  if (provider === "bailian") {
    return {
      provider,
      endpoint: endpointForWorkspace(value.workspaceId || ""),
      apiKey: String(value.apiKey),
      model: String(value.companionModel || DEFAULT_COMPANION_MODEL).trim() || DEFAULT_COMPANION_MODEL,
    };
  }
  let endpoint;
  try { endpoint = new URL(String(value.endpoint || "")); } catch { throw stableModelError(); }
  if (!String(value.model || "").trim() || !["https:", "http:"].includes(endpoint.protocol)) throw stableModelError();
  return { provider, endpoint: endpoint.href, apiKey: String(value.apiKey), model: String(value.model).slice(0, 120) };
}

function visibleDelta(data = {}) {
  const choice = data?.choices?.[0];
  const delta = choice?.delta || choice?.message || {};
  if (delta.tool_calls || delta.function_call || choice?.message?.tool_calls) throw stableModelError("three-stage-tool-call-rejected");
  return typeof delta.content === "string" ? cleanVisibleText(delta.content) : "";
}

function sseFrames(buffer) {
  const normalized = String(buffer || "").replace(/\r\n/g, "\n");
  const pieces = normalized.split("\n\n");
  return { frames: pieces.slice(0, -1), rest: pieces.at(-1) || "" };
}

class OpenAiStreamingCompanionModelAdapter {
  constructor({ config, name, persona, memoryContext, fetchImpl = globalThis.fetch, timeoutMs = 30000, now = Date.now } = {}) {
    this.config = normalizedModelConfig(config);
    if (typeof fetchImpl !== "function") throw stableModelError();
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1000, Math.min(60000, Number(timeoutMs) || 30000));
    this.now = now;
    this.systemPrompt = `${buildPersonaInstructions({ name, persona, memoryContext })}\n你正在 DeskMate 的实时语音会话中，用户的话已经通过麦克风成功送达。用户问“能听到吗”时，应按当前语音会话直接回答听得到。不得声称没有麦克风、只能文字聊天，也不要解释识别、转写、ASR、TTS 或文字中转等内部链路。你只负责自然对话，不得执行工具。先直接回答，通常不超过 6 句或 300 个汉字；只有用户明确要求详细说明时才适当展开。只输出要让用户听到的正文。`;
    this.history = [];
  }

  messages(text) {
    return [
      { role: "system", content: this.systemPrompt },
      ...this.history.slice(-MAX_HISTORY_TURNS),
      { role: "user", content: text },
    ];
  }

  remember(userText, assistantText) {
    this.history.push({ role: "user", content: userText }, { role: "assistant", content: assistantText });
    if (this.history.length > MAX_HISTORY_TURNS) this.history.splice(0, this.history.length - MAX_HISTORY_TURNS);
  }

  async streamTurn({ text, signal, onDelta = () => {} } = {}) {
    const userText = cleanVisibleText(text).trim();
    if (!userText) throw stableModelError("three-stage-stream-invalid");
    const controller = new AbortController();
    const abort = () => controller.abort("cancelled");
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    try {
      const body = {
        model: this.config.model,
        messages: this.messages(userText),
        stream: true,
        temperature: 0.55,
        max_tokens: 360,
      };
      if (this.config.provider === "bailian") body.enable_thinking = false;
      const response = await this.fetchImpl(this.config.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response?.ok) throw stableModelError();
      let answer = "";
      if (!response.body || typeof response.body[Symbol.asyncIterator] !== "function") {
        const data = await response.json();
        const delta = visibleDelta(data);
        if (!delta) throw stableModelError("three-stage-stream-invalid");
        answer = delta;
        onDelta(delta, answer);
      } else {
        const decoder = new TextDecoder();
        let buffer = "";
        const acceptFrame = (frame) => {
          for (const line of String(frame || "").split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let data;
            try { data = JSON.parse(payload); } catch { throw stableModelError("three-stage-stream-invalid"); }
            const delta = visibleDelta(data);
            if (!delta) continue;
            if (answer.length + delta.length > 16 * 1024) throw stableModelError("three-stage-response-too-large");
            answer += delta;
            onDelta(delta, answer);
          }
        };
        for await (const chunk of response.body) {
          if (controller.signal.aborted) throw stableModelError("three-stage-model-cancelled");
          buffer += decoder.decode(chunk, { stream: true });
          const split = sseFrames(buffer);
          buffer = split.rest;
          split.frames.forEach(acceptFrame);
        }
        buffer += decoder.decode();
        if (buffer.trim()) acceptFrame(buffer);
      }
      answer = cleanVisibleText(answer).trim();
      if (!answer) throw stableModelError("three-stage-stream-invalid");
      this.remember(userText, answer);
      return { ok: true, text: answer };
    } catch (error) {
      if (controller.signal.aborted) throw stableModelError("three-stage-model-cancelled");
      if (/^three-stage-[a-z-]+$/.test(String(error?.message || ""))) throw error;
      throw stableModelError();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  close() { this.history = []; }
}

module.exports = {
  DEFAULT_COMPANION_MODEL,
  MAX_HISTORY_TURNS,
  OpenAiStreamingCompanionModelAdapter,
  normalizedModelConfig,
  sseFrames,
  visibleDelta,
};
