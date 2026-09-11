const { spawn } = require("child_process");

function stableReason(value, fallback = "knowledgeos-request-failed") {
  const reason = String(value || "");
  return /^knowledgeos-[a-z0-9-]{1,64}$/.test(reason) ? reason : fallback;
}

class KnowledgeOsMcpClient {
  constructor({ settings, spawnProcess = spawn, timeoutMs = 20000 } = {}) {
    if (!settings?.loadConnection || typeof spawnProcess !== "function") throw new Error("knowledgeos-client-dependency-missing");
    this.settings = settings;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = Math.max(2000, Math.min(60000, Number(timeoutMs) || 20000));
  }

  async callTool(name, argumentsValue = {}) {
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
      let buffer = "";
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { child.stdin.end(); } catch { /* already closed */ }
        try { child.kill(); } catch { /* already closed */ }
        resolve(value);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: "knowledgeos-request-timeout", retryable: true }), this.timeoutMs);
      timer.unref?.();
      child.on("error", () => finish({ ok: false, reason: "knowledgeos-adapter-start-failed", retryable: true }));
      child.on("exit", () => { if (!settled) finish({ ok: false, reason: "knowledgeos-adapter-exited", retryable: true }); });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message?.id !== 2) continue;
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
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: argumentsValue } })}\n`);
      } catch { finish({ ok: false, reason: "knowledgeos-adapter-write-failed", retryable: true }); }
    });
  }

  testConnection() { return this.callTool("health.get_summary", {}); }
}

module.exports = { KnowledgeOsMcpClient };
