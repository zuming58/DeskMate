const crypto = require("crypto");
const { requestTextModelJson } = require("./text-model-json.cjs");
const { summarizeCodexWork } = require("./codex-work-summary.cjs");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_TTL_MS = 60_000;

function safeReason(value) { return /^[a-z0-9-]{1,80}$/.test(String(value || "")) ? String(value) : "intent-bridge-failed"; }

function isCodexStatusQuery(value, { hasKnownTasks = false } = {}) {
  const source = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  const namesCodex = /(?:codex|code\s*[xs]?|代码助手|编程任务)/i.test(source);
  const asksStatus = /(?:状态|进度|进行到|做到|完成|做完|结束|哪一步|怎么样|如何|跑到|还在|情况|几个|多少个|哪些|什么任务|哪个任务|正在运行|报错|出错|失败)/u.test(source);
  const explicitlyPersonalTask = /(?:我的|这个|那个|当前|现在|哪个|哪一个).{0,8}(?:任务|项目)/u.test(source)
    && /(?:状态|进度|进行到|做到|完成|做完|结束|哪一步|跑到|还在|情况|几个|多少个|哪些|什么任务|哪个任务|正在运行|报错|出错|失败)/u.test(source);
  const knownTaskReference = hasKnownTasks && /(?:任务|项目)/u.test(source) && asksStatus;
  return (namesCodex && asksStatus) || explicitlyPersonalTask || knownTaskReference;
}

function isContextualCodexStatusFollowUp(value) {
  const source = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[，。！？、,.!?\s]+/gu, "");
  return /^(?:那|那么|然后|所以|它|他|这个|那个|这边|现在|目前|后来|刚才|我的|你的|咱们的|我们的)*(?:怎么样了|如何了|到哪了|到哪一步了|做到哪了|跑到哪了|进展呢|状态呢|什么任务|哪个任务|有哪些任务|几个任务|多少个任务|任务情况|项目情况|完成了吗|做完了吗|结束了吗|好了没有|好了吗|有结果了吗|报错了吗|出错了吗|失败了吗|还在跑吗|还在做吗|还在进行吗|还没好吗)$/u.test(source);
}

function motionPresetFromUtterance(value) {
  const source = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  if (isMotionNegation(source)) return "";
  if (/(?:跳.{0,3}舞|舞蹈)/u.test(source)) return "dance";
  if (/(?:点.{0,3}头)/u.test(source)) return "nod";
  if (/(?:寻找|看看周围|看一看周围|环视)/u.test(source)) return "search";
  if (/(?:看着我|关注我|关注动作)/u.test(source)) return "attention";
  return "";
}

function isMotionNegation(value) {
  const source = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  return /(?:不要|别|不用|停止|取消).{0,5}(?:跳舞|点头|寻找|看看周围|看着我|关注)/u.test(source);
}

function shouldClassifyWithModel(value, apps = []) {
  const source = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  if (/(?:点.{0,3}头|跳.{0,3}舞|寻找|看看周围|看着我|关注动作)/u.test(source)) return true;
  if (/(?:任务|项目|codex|code\s*[xs]?|代码助手|软件|固件)/iu.test(source)
    && /(?:状态|进度|进行到|做到|完成|做完|结束|哪一步|跑到|还在|工作情况|报错|出错|失败)/u.test(source)) return true;
  if (!/(?:打开|启动|运行|开启)/u.test(source)) return false;
  return apps.some((app) => {
    const label = String(app?.label || "").normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
    return label.length >= 2 && source.includes(label);
  });
}

class CompanionIntentBridge {
  constructor({ loadSecret, appActions, codexStatus, codexTasks = null, motionAction = null, requestJson = requestTextModelJson, now = () => Date.now(), createToken = () => crypto.randomUUID() } = {}) {
    this.loadSecret = loadSecret;
    this.appActions = appActions;
    this.codexStatus = codexStatus;
    this.codexTasks = codexTasks;
    this.motionAction = motionAction;
    this.requestJson = requestJson;
    this.now = now;
    this.createToken = createToken;
    this.pending = new Map();
    this.codexSelectionExpiresAt = 0;
    this.codexContextExpiresAt = 0;
    this.last = { status: "idle", type: "none", label: "没有待确认动作", reason: "", expiresAt: 0 };
  }

  status() {
    if (this.last.expiresAt && this.last.expiresAt <= this.now()) this.last = { status: "expired", type: "none", label: "动作建议已过期", reason: "intent-confirmation-expired", expiresAt: 0 };
    return { ...this.last, bridge: "ready", contextActive: this.codexContextExpiresAt > this.now(), taskCount: Math.min(8, this.codexTasks?.list?.().length || 0) };
  }

  noteCodexReport() {
    if ((this.codexTasks?.list?.().length || 0) > 0) this.codexContextExpiresAt = this.now() + TOKEN_TTL_MS;
  }

  codexStatusResult(source) {
    const brief = this.codexTasks?.query?.(source);
    const coarse = summarizeCodexWork(this.codexStatus());
    const codex = brief?.available || brief?.needsDisambiguation ? brief : { ...coarse, answer: `尚未收到可识别任务名称的 Codex 实时状态；目前只能确认总体状态是${coarse.summary}`, available: Boolean(this.codexStatus()?.connected), needsDisambiguation: false, source: "codex-hook-v1" };
    const answer = String(codex.answer || codex.summary || "Codex 当前状态不可用").slice(0, 500);
    this.codexSelectionExpiresAt = codex.needsDisambiguation || codex.aggregate ? this.now() + TOKEN_TTL_MS : 0;
    if (brief?.available || brief?.needsDisambiguation) this.codexContextExpiresAt = this.now() + TOKEN_TTL_MS;
    this.last = { status: "completed", type: "query_codex_status", label: answer, reason: "", expiresAt: 0 };
    return { ok: true, proposal: null, result: { type: "query_codex_status", ok: true, answer, codex } };
  }

  resolveDeterministic(text) {
    const source = String(text || "").trim().slice(0, 4000);
    if (!source) return null;
    const namedFollowUp = this.codexSelectionExpiresAt > this.now() && this.codexTasks?.matchesTaskLabel?.(source);
    const hasKnownTasks = (this.codexTasks?.list?.().length || 0) > 0;
    const contextualFollowUp = hasKnownTasks && this.codexContextExpiresAt > this.now() && isContextualCodexStatusFollowUp(source);
    if (!isCodexStatusQuery(source, { hasKnownTasks }) && !namedFollowUp && !contextualFollowUp) return null;
    return this.codexStatusResult(source);
  }

  async analyze(text) {
    const source = String(text || "").trim().slice(0, 4000);
    if (!source) return { ok: true, proposal: null };
    const deterministic = this.resolveDeterministic(source);
    if (deterministic) return deterministic;
    if (isMotionNegation(source)) {
      this.last = { status: "none", type: "none", label: "已识别为不执行动作", reason: "", expiresAt: 0 };
      return { ok: true, proposal: null };
    }
    const deterministicMotion = motionPresetFromUtterance(source);
    if (deterministicMotion) return this.executeMotion(deterministicMotion);
    const apps = this.appActions?.listRegistered?.({ limit: 100 }) || [];
    if (!shouldClassifyWithModel(source, apps)) {
      this.last = { status: "none", type: "none", label: "本轮已由 Bridge 判定为普通对话", reason: "", expiresAt: 0 };
      return { ok: true, proposal: null };
    }
    const recentCodexTasks = (this.codexTasks?.list?.() || []).slice(0, 8).map((task) => ({ taskLabel: task.taskLabel, state: task.state }));
    let parsed;
    try {
      parsed = await this.requestJson({
        secret: this.loadSecret(),
        messages: [
          { role: "system", content: "你是 DeskMate 实时对话 Bridge 的前置意图分类器。每轮用户最终句都必须先由你分类，再决定是否交给自由聊天。用户询问自己的 Codex/编程任务、项目进度、完成或报错情况时返回 query_codex_status。只允许返回 none、open_application、query_codex_status、run_motion_preset。不得生成命令、路径、参数、网页或硬件数据。打开应用只能从提供的 id/label 中选择。动作预设只可返回 attention、search、nod、dance。只返回 JSON：{\"type\":\"none|open_application|query_codex_status|run_motion_preset\",\"actionId\":\"\",\"preset\":\"\"}。" },
          { role: "user", content: `<registered_apps>${JSON.stringify(apps)}</registered_apps>\n<recent_codex_tasks>${JSON.stringify(recentCodexTasks)}</recent_codex_tasks>\n<utterance>${JSON.stringify(source)}</utterance>` },
        ],
      });
    } catch (error) {
      const reason = safeReason(error?.message);
      this.last = { status: "failed", type: "none", label: "意图分析暂不可用", reason, expiresAt: 0 };
      return { ok: false, reason, proposal: null };
    }
    const type = ["open_application", "query_codex_status", "run_motion_preset"].includes(parsed?.type) ? parsed.type : "none";
    if (type === "none") {
      this.last = { status: "none", type, label: "本轮无需执行桌面动作", reason: "", expiresAt: 0 };
      return { ok: true, proposal: null };
    }
    if (type === "open_application") {
      const actionId = String(parsed.actionId || "");
      const action = UUID_PATTERN.test(actionId) ? this.appActions.describe(actionId) : null;
      if (!action) return { ok: false, reason: "intent-application-not-registered", proposal: null };
      if (action.voiceEnabled !== true) {
        this.last = { status: "failed", type, label: `未打开应用：${action.label}`, reason: "application-voice-not-enabled", expiresAt: 0 };
        return { ok: false, reason: "application-voice-not-enabled", proposal: null, result: { type, ok: false, reason: "application-voice-not-enabled", label: action.label } };
      }
      const result = await this.appActions.executeVoice(actionId);
      this.last = { status: result?.ok ? "completed" : "failed", type, label: result?.ok ? `已打开应用：${action.label}` : `未打开应用：${action.label}`, reason: result?.ok ? "" : safeReason(result?.reason), expiresAt: 0 };
      const answer = result?.ok ? `已打开${action.label}` : `没有打开${action.label}，请检查应用白名单设置`;
      return { ok: Boolean(result?.ok), reason: result?.ok ? "" : safeReason(result?.reason), proposal: null, result: { type, ...result, answer } };
    }
    if (type === "query_codex_status") {
      return this.codexStatusResult(source);
    }
    const preset = ["attention", "search", "nod", "dance"].includes(parsed?.preset) ? parsed.preset : "";
    return this.executeMotion(preset);
  }

  async executeMotion(preset) {
    const type = "run_motion_preset";
    if (!preset || typeof this.motionAction !== "function") {
      this.last = { status: "failed", type, label: "动作控制暂不可用", reason: "motion-action-unavailable", expiresAt: 0 };
      return { ok: false, reason: "motion-action-unavailable", proposal: null, result: { type, ok: false, reason: "motion-action-unavailable", preset } };
    }
    const result = await this.motionAction(preset);
    const label = ({ attention: "关注", nod: "点头", search: "寻找", dance: "跳舞" })[preset];
    this.last = { status: result?.ok ? "completed" : "failed", type, label: result?.ok ? `已完成${label}动作` : `${label}动作未完成`, reason: result?.ok ? "" : safeReason(result?.reason), expiresAt: 0 };
    const answer = result?.ok ? `已经执行${label}动作` : `${label}动作暂时无法执行`;
    return { ok: Boolean(result?.ok), reason: result?.ok ? "" : safeReason(result?.reason), proposal: null, result: { type, preset, ...result, answer } };
  }

  reject(token) {
    const existed = this.pending.delete(String(token || ""));
    this.last = { status: existed ? "rejected" : "expired", type: "none", label: existed ? "已取消动作建议" : "动作建议不存在或已过期", reason: existed ? "" : "intent-confirmation-expired", expiresAt: 0 };
    return { ok: existed, reason: existed ? "" : "intent-confirmation-expired" };
  }

  async confirm(token) {
    const key = String(token || "");
    const proposal = this.pending.get(key);
    this.pending.delete(key);
    if (!proposal || proposal.expiresAt <= this.now()) return { ok: false, reason: "intent-confirmation-expired" };
    let result;
    if (proposal.type === "open_application") result = await this.appActions.execute(proposal.actionId);
    else result = { ok: true, codex: summarizeCodexWork(this.codexStatus()) };
    this.last = { status: result?.ok ? "completed" : "failed", type: proposal.type, label: proposal.label, reason: result?.ok ? "" : safeReason(result?.reason), expiresAt: 0 };
    return result;
  }
}

module.exports = { CompanionIntentBridge, TOKEN_TTL_MS, isCodexStatusQuery, isContextualCodexStatusFollowUp, isMotionNegation, motionPresetFromUtterance, shouldClassifyWithModel };
