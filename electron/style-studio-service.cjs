const { buildStyleStudioPrompt } = require("./style-studio-presets.cjs");
const { generateQwenImage } = require("./qwen-image-adapter.cjs");

function requestId(value) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw new Error("style-studio-request-id-invalid");
  return id;
}

function publicError(error) {
  const reason = String(error?.message || "");
  if (reason === "style-studio-consent-required") return "请先确认本次照片将上传到百炼生成";
  if (reason === "style-studio-generation-busy") return "已有一张作品正在生成，请稍候或先取消";
  if (reason === "style-studio-source-not-found" || reason === "style-studio-item-not-found") return "素材已不存在，请重新选择";
  if (reason === "style-studio-source-limit") return "本地素材库最多保存 8 张素材";
  if (reason === "style-studio-result-limit") return "本地作品库已满（24 张），请先删除不需要的作品";
  if (reason === "style-studio-source-in-use") return "这张素材仍有关联作品，请先删除对应作品";
  if (reason === "style-studio-asset-delete-failed") return "本地记录已移除，但图片文件未能清理";
  if (reason === "style-studio-image-too-large") return "图片超过当前 10 MB 素材限制";
  if (["style-studio-image-empty", "style-studio-image-invalid", "style-studio-image-type-mismatch", "style-studio-image-pixels-too-large"].includes(reason)) return "图片格式无效、像素过大或扩展名与内容不一致";
  if (["style-studio-library-corrupt", "style-studio-asset-corrupt"].includes(reason)) return "本地素材库校验失败，未继续读取或覆盖数据";
  if (reason === "qwen-image-cancelled") return "本次生成已取消";
  if (reason === "qwen-image-timeout") return "生成等待超时，请稍后重试";
  if (reason.startsWith("qwen-image-http-") || reason.startsWith("qwen-image-download-http-")) return "百炼生成暂时失败，请稍后重试";
  if (reason.startsWith("style-studio-") || reason.startsWith("qwen-image-")) return "风格作品生成失败，请检查图片后重试";
  if (/API Key|安全存储|业务空间/.test(reason)) return reason;
  return "风格作品生成失败，请稍后重试";
}

class StyleStudioService {
  constructor({ store, credentialStore, generate = generateQwenImage }) {
    this.store = store;
    this.credentialStore = credentialStore;
    this.generateImage = generate;
    this.active = null;
  }

  status() {
    const credentials = this.credentialStore.status();
    return { ok: true, configured: credentials.configured === true, provider: "百炼 · 千问图像 3.0", model: "qwen-image-3.0", active: Boolean(this.active) };
  }

  list() { return { ok: true, ...this.store.list() }; }
  importSource(value) { return { ok: true, ...this.store.importSource(value) }; }
  read(value) { const result = this.store.read(value?.id, value?.kind); return { ok: true, record: result.record, bytes: result.bytes }; }
  remove(value) { return { ok: true, ...this.store.remove(value?.id) }; }

  async generate(value = {}) {
    if (value.consent !== true) throw new Error("style-studio-consent-required");
    if (this.active) throw new Error("style-studio-generation-busy");
    const id = requestId(value.requestId);
    const source = this.store.read(value.sourceId, "source");
    const style = buildStyleStudioPrompt(value.styleId, value.strength, value.brief);
    const secret = this.credentialStore.loadSecret();
    const controller = new AbortController();
    this.active = { id, controller };
    try {
      const generated = await this.generateImage({
        apiKey: secret.apiKey,
        workspaceId: secret.workspaceId,
        sourceBytes: source.bytes,
        sourceMime: source.record.mime,
        prompt: style.prompt,
        signal: controller.signal,
      });
      const record = this.store.addResult({
        sourceId: source.record.id,
        styleId: style.styleId,
        styleName: style.styleName,
        strength: style.strength,
        brief: style.brief,
        name: style.styleName,
        mime: generated.mime,
        bytes: generated.bytes,
      });
      return { ok: true, record, bytes: generated.bytes, requestId: generated.requestId, usage: generated.usage };
    } finally {
      if (this.active?.id === id) this.active = null;
    }
  }

  cancel(value) {
    const id = String(value || "");
    if (!this.active || this.active.id !== id) return { ok: false, reason: "request-not-active" };
    this.active.controller.abort("cancelled");
    return { ok: true };
  }

  close() { this.active?.controller.abort("cancelled"); this.active = null; }
}

module.exports = { StyleStudioService, publicError, requestId };
