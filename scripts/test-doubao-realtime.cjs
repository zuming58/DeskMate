const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");
const { createSecureAiServiceStore } = require("../electron/secure-ai-services.cjs");
const { DoubaoRealtimeSession } = require("../electron/doubao-realtime.cjs");

const outputPath = process.env.DESKMATE_DOUBAO_TEST_RESULT || "";
const userDataPath = path.join(process.env.APPDATA || app.getPath("appData"), "deskmate");
app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const report = { ok: false, provider: "doubao", stage: "starting", events: [] };
  let realtime;
  try {
    const store = createSecureAiServiceStore({ safeStorage, userDataPath });
    realtime = new DoubaoRealtimeSession({
      config: store.loadRealtimeSecret(),
      connectTimeoutMs: 12000,
      onEvent: (event) => {
        const type = String(event?.type || "unknown").slice(0, 80);
        if (!report.events.includes(type) && report.events.length < 12) report.events.push(type);
      },
    });
    const result = await realtime.connect();
    report.ok = result?.ok === true;
    report.stage = report.ok ? "session-ready" : "connect-failed";
  } catch (error) {
    report.stage = "connect-failed";
    report.reason = /^[a-z0-9-]{1,120}$/.test(String(error?.message || "")) ? error.message : "doubao-test-failed";
  } finally {
    realtime?.close?.();
  }
  if (outputPath && path.extname(outputPath).toLowerCase() === ".json") fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  else process.stdout.write(`${JSON.stringify(report)}\n`);
  app.exit(report.ok ? 0 : 1);
}).catch(() => app.exit(1));
