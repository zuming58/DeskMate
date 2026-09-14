const { Worker } = require("node:worker_threads");
const path = require("node:path");
class LocalHistoryService {
  constructor({ userDataPath }) { this.userDataPath = userDataPath; this.pending = new Map(); this.sequence = 0; this.closed = false; }
  call(command, value) {
    if (this.closed) return Promise.reject(new Error("local-history-service-closed"));
    if (!this.worker) {
      const worker = this.worker = new Worker(path.join(__dirname, "local-history-worker.cjs"), { workerData: { userDataPath: this.userDataPath } });
      worker.on("message", ({ id, result, error }) => { const entry = this.pending.get(id); if (!entry) return; this.pending.delete(id); error ? entry.reject(new Error(error)) : entry.resolve(result); });
      const failed = () => { if (this.worker !== worker) return; this.worker = null; for (const entry of this.pending.values()) entry.reject(new Error("local-history-worker-unavailable")); this.pending.clear(); };
      worker.on("error", failed); worker.on("exit", failed);
    }
    if (this.pending.size >= 100) return Promise.reject(new Error("local-history-busy"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence; this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, command, value }); } catch { this.pending.delete(id); reject(new Error("local-history-message-invalid")); }
    });
  }
  close() { this.closed = true; void this.worker?.terminate(); for (const entry of this.pending.values()) entry.reject(new Error("local-history-service-closed")); this.pending.clear(); }
}
module.exports = { LocalHistoryService };
