const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");
const { createSecureAiServiceStore } = require("../electron/secure-ai-services.cjs");
const { DoubaoRealtimeSession } = require("../electron/doubao-realtime.cjs");

const outputPath = process.env.DESKMATE_DOUBAO_TEST_RESULT || "";
const ttsSmoke = process.argv.includes("--tts-smoke");
const ttsHelloSmoke = process.argv.includes("--tts-hello-smoke");
const ttsHelloTwiceSmoke = process.argv.includes("--tts-hello-twice-smoke");
const userDataPath = path.join(process.env.APPDATA || app.getPath("appData"), "deskmate");
app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  const report = { ok: false, provider: "doubao", stage: "starting", events: [], audioFrames: 0, audioBytes: 0, ttsEnds: 0 };
  let realtime;
  let finishTts;
  try {
    const store = createSecureAiServiceStore({ safeStorage, userDataPath });
    realtime = new DoubaoRealtimeSession({
      config: store.loadRealtimeSecret(),
      connectTimeoutMs: 12000,
      onEvent: (event) => {
        const type = String(event?.type || "unknown").slice(0, 80);
        if (!report.events.includes(type) && report.events.length < 12) report.events.push(type);
        if (event?.type === "audio") {
          report.audioFrames = Math.min(100000, report.audioFrames + 1);
          report.audioBytes = Math.min(64 * 1024 * 1024, report.audioBytes + Buffer.from(event.audio || []).length);
        }
        if (event?.type === "tts.end") {
          report.ttsEnds += 1;
          if (ttsHelloTwiceSmoke && report.ttsEnds === 1) realtime?.sayHello?.("这是第二段语音合成测试。");
          else finishTts?.(event.type);
        } else if (["error", "connection.closed"].includes(event?.type)) finishTts?.(event.type);
      },
    });
    const result = await realtime.connect();
    report.ok = result?.ok === true;
    report.stage = report.ok ? "session-ready" : "connect-failed";
    if (report.ok && (ttsSmoke || ttsHelloSmoke || ttsHelloTwiceSmoke)) {
      const terminal = new Promise((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), 15000);
        timer.unref?.();
        finishTts = (type) => { clearTimeout(timer); resolve(type); };
      });
      const sent = ttsHelloSmoke || ttsHelloTwiceSmoke ? realtime.sayHello("语音合成测试。") : realtime.speakText("语音合成测试。");
      if (!sent) throw new Error("doubao-tts-send-failed");
      const terminalType = await terminal;
      const expectedEnds = ttsHelloTwiceSmoke ? 2 : 1;
      report.ok = terminalType === "tts.end" && report.ttsEnds === expectedEnds && report.audioFrames > 0 && report.audioBytes > 0;
      report.stage = report.ok ? "tts-complete" : terminalType === "timeout" ? "tts-timeout" : "tts-failed";
    }
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
