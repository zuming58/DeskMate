import { deleteRecordingBlobs, getLegacyRecording, listLegacyRecordingIds } from "./recordingStore.js";

export const LEGACY_SOURCE_KEY = "deskmate.history-migration-source.v1";
export const MIGRATION_COMPLETE_KEY = "deskmate.history-migration-complete.v1";
const bridge = () => globalThis.desktopBridge;
export const hasManagedHistory = () => typeof bridge()?.localHistory === "function";
export const historyCommand = (command, value) => bridge().localHistory({ version: 1, command, value });
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function copyLegacyAudio(id) {
  const item = await getLegacyRecording(id);
  if (!item?.blob) throw new Error("旧录音缺失，原历史已保留，请先导出文字");
  const bytes = new Uint8Array(await item.blob.arrayBuffer());
  const expected = await digest(bytes);
  const result = await historyCommand("audio-put", { id, bytes, mime: item.blob.type || "audio/webm", createdAt: item.createdAt || null });
  if (result.digest !== expected || result.size !== bytes.length) throw new Error("录音完整性校验失败");
  return { id, digest: expected, size: bytes.length };
}
export async function loadManagedHistory() {
  const rows = [];
  const { maxSequence } = await historyCommand("status");
  for (let offset = 0; ; offset += 200) {
    const batch = await historyCommand("list", { offset, limit: 200, maxSequence });
    rows.push(...batch);
    if (batch.length < 200) return rows;
  }
}
export async function migrateLegacyHistory(records, storage = globalThis.localStorage) {
  const status = await historyCommand("status");
  if (status.migrated) { storage.setItem(MIGRATION_COMPLETE_KEY, "1"); return loadManagedHistory(); }
  if (storage.getItem(MIGRATION_COMPLETE_KEY) === "1") throw new Error("已迁移的主数据库缺失或不完整，已停止切换，请保留数据并恢复备份");
  // Preserve the exact source before changing active storage. Never delete it on success.
  let source = storage.getItem(LEGACY_SOURCE_KEY);
  if (!source) { source = JSON.stringify(records); storage.setItem(LEGACY_SOURCE_KEY, source); }
  const legacy = JSON.parse(source);
  if (!Array.isArray(legacy)) throw new Error("旧历史格式损坏，迁移暂停");
  const ids = new Set(); const manifest = [];
  for (let offset = 0; offset < legacy.length; offset += 50) {
    const batch = legacy.slice(offset, offset + 50);
    for (const record of batch) {
      if (record.id == null || ids.has(String(record.id))) throw new Error("旧历史 ID 缺失或重复，需要人工处理");
      ids.add(String(record.id));
      manifest.push({ id: record.id, digest: await digest(new TextEncoder().encode(JSON.stringify(record))) });
    }
    await historyCommand("stage", { records: batch.map((record) => ({ record })) });
  }
  const audioManifest = [];
  for (const id of await listLegacyRecordingIds()) audioManifest.push(await copyLegacyAudio(id));
  await historyCommand("finish", { manifest, audioManifest });
  storage.setItem(MIGRATION_COMPLETE_KEY, "1");
  return loadManagedHistory();
}

export async function cleanupLegacyRetention({ historyIds = [], audioIds = [] } = {}, storage = globalThis.localStorage) {
  purgeCompletedRestoreCopies(storage);
  const boundedIds = (items) => {
    if (!Array.isArray(items) || items.length > 100000) throw new Error("清理清单无效");
    return new Set(items.map(String).filter((id) => id && id.length <= 200 && !/[\x00-\x1f]/.test(id)));
  };
  const history = boundedIds(historyIds), audio = boundedIds(audioIds);
  const retainWithoutAudio = (item) => {
    if (!audio.has(String(item?.audioId || ""))) return item;
    const next = { ...item, recordingUnavailable: true }; delete next.audioId; return next;
  };
  const pendingRaw = storage.getItem("deskmate.history-pending.v1");
  if (pendingRaw) {
    const pending = JSON.parse(pendingRaw);
    if (!Array.isArray(pending)) throw new Error("待保存队列损坏，清理暂停");
    if (pending.some((item) => history.has(String(item?.id || "")))) throw new Error("存在并发写入，清理暂停");
  }
  const legacyRaw = storage.getItem(LEGACY_SOURCE_KEY);
  if (legacyRaw) {
    const legacy = JSON.parse(legacyRaw);
    if (!Array.isArray(legacy)) throw new Error("旧历史格式损坏，清理暂停");
    storage.setItem(LEGACY_SOURCE_KEY, JSON.stringify(legacy.filter((item) => !history.has(String(item?.id || ""))).map(retainWithoutAudio)));
  }
  const appRaw = storage.getItem("deskmate.app-state");
  if (appRaw) {
    const appState = JSON.parse(appRaw);
    if (!appState || typeof appState !== "object" || Array.isArray(appState) || (appState.history != null && !Array.isArray(appState.history))) throw new Error("本地设置格式损坏，清理暂停");
    if (Array.isArray(appState.history)) {
      appState.history = appState.history.filter((item) => !history.has(String(item?.id || ""))).map(retainWithoutAudio);
      storage.setItem("deskmate.app-state", JSON.stringify(appState));
    }
  }
  await deleteRecordingBlobs([...audio]);
  return { ok: true, history: history.size, recordings: audio.size };
}

// Called only by a consented retention job; incomplete handovers are never aged out.
export function purgeCompletedRestoreCopies(storage = globalThis.localStorage, now = Date.now()) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!/^deskmate\.restore\.[a-f0-9-]{36}\.completed-at$/.test(key || '')) continue;
    const at = Number(storage.getItem(key));
    if (!Number.isFinite(at) || at <= 0 || now - at <= 7 * 86400000) continue;
    const marker = key.slice(0, -'.completed-at'.length);
    storage.removeItem(`${marker}.previous`); storage.removeItem(marker); storage.removeItem(key);
  }
}
