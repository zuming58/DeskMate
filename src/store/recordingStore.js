const DATABASE_NAME = "deskmate-recordings";
const DATABASE_VERSION = 1;
const STORE_NAME = "audio";

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("当前环境不支持 IndexedDB，录音无法跨页面保存"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开录音数据库"));
  });
}

async function runTransaction(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let request;
      let result;
      try {
        request = operation(store);
      } catch (cause) {
        reject(cause);
        return;
      }
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("录音数据库操作失败"));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error("录音数据库事务已中止"));
      transaction.onerror = () => reject(transaction.error || new Error("录音数据库事务失败"));
    });
  } finally {
    database.close();
  }
}

export async function saveRecordingBlob(id, blob) {
  if (!(blob instanceof Blob)) return Promise.reject(new Error("录音数据无效"));
  if (globalThis.desktopBridge?.localHistory) {
    try {
      return await globalThis.desktopBridge.localHistory({ version: 1, command: "audio-put", value: { id, bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || "audio/webm", createdAt: Date.now() } });
    } catch {
      // Keep a retry source when the primary disk service is unavailable.
      return runTransaction("readwrite", (store) => store.put({ id, blob, createdAt: Date.now() }));
    }
  }
  return runTransaction("readwrite", (store) => store.put({ id, blob, createdAt: Date.now() }));
}

export async function getRecordingBlob(id) {
  if (globalThis.desktopBridge?.localHistory) {
    const result = await globalThis.desktopBridge.localHistory({ version: 1, command: "audio-get", value: id });
    if (result) return new Blob([result.bytes], { type: result.mime });
  }
  const result = await runTransaction("readonly", (store) => store.get(id));
  return result?.blob || null;
}

export const getLegacyRecording = (id) => runTransaction("readonly", (store) => store.get(id));
export const listLegacyRecordingIds = () => runTransaction("readonly", (store) => store.getAllKeys());

export function deleteRecordingBlob(id) {
  return runTransaction("readwrite", (store) => store.delete(id));
}

export function clearRecordingBlobs() {
  return runTransaction("readwrite", (store) => store.clear());
}

// Delete only recordings that the user confirmed, never a concurrently captured recording.
export function deleteRecordingBlobs(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return Promise.resolve();
  return runTransaction("readwrite", (store) => {
    let request;
    for (const id of unique) request = store.delete(id);
    return request;
  });
}
