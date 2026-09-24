const { spawn } = require("child_process");

function stableReason(value, fallback = "knowledgeos-request-failed") {
  // KnowledgeOS uses snake_case codes; keep the meaningful code, not its detail.
  const reason = String(value || "").replace(/_/g, '-');
  return /^knowledgeos-[a-z0-9-]{1,64}$/.test(reason) ? reason : fallback;
}

class KnowledgeOsMcpClient {
  constructor({ settings, spawnProcess = spawn, timeoutMs = 20000 } = {}) {
    if (!settings?.loadConnection || typeof settings.status !== 'function' || typeof spawnProcess !== "function") throw new Error("knowledgeos-client-dependency-missing");
    this.settings = settings;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = Math.max(2000, Math.min(60000, Number(timeoutMs) || 20000));
    this.pending = new Set();
  }

  allowed(name) {
    const status = this.settings.status();
    if (name === 'health.get_summary') return status.readEnabled === true || status.syncEnabled === true;
    if (name === 'knowledge.search') return status.readEnabled === true;
    if (['memory.submit_journal', 'submission.get_status'].includes(name)) return status.syncEnabled === true;
    return false;
  }

  cancelPending() { for (const cancel of [...this.pending]) cancel(); }

  async callTool(name, argumentsValue = {}, { signal } = {}) {
    if (!this.allowed(name)) return { ok: false, reason: 'knowledgeos-disabled', retryable: false };
    if (signal?.aborted) return { ok: false, reason: 'knowledgeos-cancelled', retryable: true };
    let connection;
    try { connection = this.settings.loadConnection(); }
    catch { return { ok: false, reason: "knowledgeos-not-configured", retryable: false }; }
    return new Promise((resolve) => {
      const environment = { ...process.env };
      for (const key of Object.keys(environment)) if (["http_proxy", "https_proxy", "all_proxy"].includes(key.toLowerCase())) delete environment[key];
      let child;
      try { child = this.spawnProcess(connection.command, ["--credential-id", connection.credentialId], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: environment }); }
      catch { resolve({ ok: false, reason: "knowledgeos-adapter-start-failed", retryable: true }); return; }
      let settled = false;
      let initialized = false;
      let buffer = "";
      const finish = (value) => {
        if (settled) return;
        settled = true;
        this.pending.delete(cancel);
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        try { child.stdin.end(); } catch { /* already closed */ }
        try { child.kill(); } catch { /* already closed */ }
        resolve(value);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: "knowledgeos-request-timeout", retryable: true }), this.timeoutMs);
      const cancel = () => finish({ ok: false, reason: 'knowledgeos-disabled', retryable: false });
      this.pending.add(cancel);
      const abort = () => finish({ ok: false, reason: 'knowledgeos-cancelled', retryable: true });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer.unref?.();
      child.on("error", () => finish({ ok: false, reason: "knowledgeos-adapter-start-failed", retryable: true }));
      child.on("exit", () => { if (!settled) finish({ ok: false, reason: "knowledgeos-adapter-exited", retryable: true }); });
      child.stdin.on?.('error', () => finish({ ok: false, reason: 'knowledgeos-adapter-write-failed', retryable: true }));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (settled) return;
        buffer += chunk;
        if (buffer.length > 1024 * 1024) { finish({ ok: false, reason: 'knowledgeos-response-too-large', retryable: false }); return; }
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message?.id === 1 && !initialized) {
            if (!this.allowed(name)) { cancel(); return; }
            if (message.error || message.result?.protocolVersion !== '2025-06-18' || !message.result?.capabilities?.tools) {
              finish({ ok: false, reason: 'knowledgeos-initialize-failed', retryable: false }); return;
            }
            initialized = true;
            try {
              child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
              child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: argumentsValue } })}\n`);
            } catch { finish({ ok: false, reason: 'knowledgeos-adapter-write-failed', retryable: true }); return; }
            continue;
          }
          if (message?.id !== 2) continue;
          if (!initialized) { finish({ ok: false, reason: 'knowledgeos-initialize-failed', retryable: false }); return; }
          if (message.error) { finish({ ok: false, reason: "knowledgeos-protocol-error", retryable: false }); return; }
          const result = message?.result || {};
          const structured = result.structuredContent || {};
          if (result.isError) finish({ ok: false, reason: stableReason(`knowledgeos-${structured.code || "request-failed"}`), retryable: structured.retryable === true });
          else finish({ ok: true, data: structured.data || {}, meta: structured.meta || {} });
          return;
        }
      });
      child.stderr?.resume?.();
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "DeskMate", version: "1" } } })}\n`);
      } catch { finish({ ok: false, reason: "knowledgeos-adapter-write-failed", retryable: true }); }
    });
  }

  testConnection() { return this.callTool("health.get_summary", {}); }
}

module.exports = { KnowledgeOsMcpClient };
