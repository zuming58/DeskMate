// Explicit, read-only maintenance probe. Never prints credentials or stderr.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const root = arg('--user-data'), reportFile = arg('--report');
if (!path.isAbsolute(root || '') || !path.isAbsolute(reportFile || '')) throw Error('probe-arguments-invalid');
app.setPath('userData', root);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const report = { readOnly: true, at: new Date().toISOString() };
  try {
    const settings = createKnowledgeOsSettings({ safeStorage, userDataPath: root });
    const connection = settings.loadConnection();
    report.adapterPath = connection.command;
    const client = new KnowledgeOsMcpClient({ settings, spawnProcess: (...input) => {
      const child = spawn(...input);
      child.on('exit', code => { report.adapterExitCode = code; });
      child.stderr.on('data', data => {
        const message = data.toString();
        for (const [key, pattern] of Object.entries({ connectionRefused: /connection refused|actively refused|10061|ECONNREFUSED/i, runtimeMissing: /runtime.*(?:not found|missing)|os error 2/i, unauthorized: /unauthorized|credential.*(?:invalid|not found)|401|403/i, unknownArgument: /unexpected argument|unknown option/i })) {
          if (pattern.test(message)) report[key] = true;
        }
      });
      return child;
    } });
    const health = await client.testConnection();
    report.health = { ok: health.ok, reason: health.reason || '' };
  } catch { report.error = 'probe-failed'; }
  finally { fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); app.quit(); }
});
