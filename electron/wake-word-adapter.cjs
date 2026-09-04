const { spawn } = require("child_process");

const WAKE_WORD_ADAPTER_VERSION = "windows-speech-wake-v1";
const PROBE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -AssemblyName System.Speech",
  "$recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -eq 'zh-CN' } | Select-Object -First 1",
  "if ($null -eq $recognizer) { exit 3 }",
  "[Console]::Out.WriteLine('ready')",
].join("; ");

const LISTENER_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Add-Type -AssemblyName System.Speech",
  "$recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -eq 'zh-CN' } | Select-Object -First 1",
  "if ($null -eq $recognizer) { exit 3 }",
  "$phrasesJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DESKMATE_WAKE_PHRASES))",
  "$phrases = @((ConvertFrom-Json $phrasesJson))",
  "if ($phrases.Count -lt 1) { exit 4 }",
  "$choices = New-Object System.Speech.Recognition.Choices",
  "$choices.Add([string[]]$phrases)",
  "$builder = New-Object System.Speech.Recognition.GrammarBuilder",
  "$builder.Culture = $recognizer.Culture",
  "$builder.Append($choices)",
  "$grammar = New-Object System.Speech.Recognition.Grammar($builder)",
  "$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizer)",
  "$engine.LoadGrammar($grammar)",
  "$threshold = [Double]::Parse($env:DESKMATE_WAKE_CONFIDENCE, [Globalization.CultureInfo]::InvariantCulture)",
  "$engine.add_SpeechRecognized({ param($sender, $args); if ($args.Result.Confidence -ge $threshold) { [Console]::Out.WriteLine('{\"type\":\"wake\"}') } })",
  "$engine.SetInputToDefaultAudioDevice()",
  "$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)",
  "[Console]::Out.WriteLine('{\"type\":\"ready\"}')",
  "while ($true) { Start-Sleep -Milliseconds 250 }",
].join("; ");

function encodedCommand(script) {
  return Buffer.from(String(script || ""), "utf16le").toString("base64");
}

function cleanPhrases(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 8).map((item) => String(item || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 64)).filter(Boolean))];
}

class WindowsSpeechWakeWordAdapter {
  constructor({ platform = process.platform, spawnImpl = spawn, onWake = () => {}, onStatus = () => {}, confidence = 0.72 } = {}) {
    this.platform = platform;
    this.spawnImpl = spawnImpl;
    this.onWake = onWake;
    this.onStatus = onStatus;
    this.confidence = Math.max(0.5, Math.min(0.95, Number(confidence) || 0.72));
    this.available = platform === "win32";
    this.probed = false;
    this.desiredEnabled = false;
    this.process = null;
    this.phrases = [];
    this.reason = this.available ? "wake-word-engine-not-probed" : "wake-word-windows-only";
  }

  status() {
    return Object.freeze({ version: WAKE_WORD_ADAPTER_VERSION, available: this.available && this.probed, enabled: Boolean(this.process), desiredEnabled: this.desiredEnabled, reason: this.process ? "listening" : this.reason, localOnly: true, optInRequired: true, visibleMicrophoneRequired: true, foregroundAudioOwnerRequired: true });
  }

  emitStatus() { this.onStatus(this.status()); }

  async run(script, { timeoutMs = 4000, environment = {} } = {}) {
    return new Promise((resolve) => {
      const child = this.spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(script)], { windowsHide: true, env: { ...process.env, ...environment } });
      let stdout = "";
      let settled = false;
      const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); try { child.kill(); } catch { /* already stopped */ } resolve(result); };
      const timer = setTimeout(() => finish({ ok: false, reason: "wake-word-probe-timeout" }), timeoutMs);
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.once("error", () => finish({ ok: false, reason: "wake-word-engine-unavailable" }));
      child.once("exit", (code) => finish(code === 0 && stdout.includes("ready") ? { ok: true } : { ok: false, reason: code === 3 ? "wake-word-zh-cn-recognizer-missing" : "wake-word-engine-unavailable" }));
    });
  }

  async probe() {
    if (!this.available) return this.status();
    const result = await this.run(PROBE_SCRIPT);
    this.probed = result.ok;
    this.available = result.ok;
    this.reason = result.ok ? "wake-word-disabled" : result.reason;
    this.emitStatus();
    return this.status();
  }

  configure({ enabled, phrases } = {}) {
    this.desiredEnabled = enabled === true;
    this.phrases = cleanPhrases(phrases);
    if (!this.desiredEnabled) this.reason = "wake-word-disabled";
    this.emitStatus();
    return this.status();
  }

  async start({ phrases } = {}) {
    if (phrases) this.phrases = cleanPhrases(phrases);
    if (!this.probed) await this.probe();
    if (!this.available) return { ok: false, reason: this.reason, status: this.status() };
    if (!this.desiredEnabled) return { ok: false, reason: "wake-word-disabled", status: this.status() };
    if (!this.phrases.length) return { ok: false, reason: "wake-word-phrase-empty", status: this.status() };
    if (this.process) return { ok: true, alreadyStarted: true, status: this.status() };
    const environment = { DESKMATE_WAKE_PHRASES: Buffer.from(JSON.stringify(this.phrases), "utf8").toString("base64"), DESKMATE_WAKE_CONFIDENCE: this.confidence.toFixed(2) };
    const child = this.spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(LISTENER_SCRIPT)], { windowsHide: true, env: { ...process.env, ...environment } });
    this.process = child;
    this.reason = "starting";
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
      for (const line of lines) {
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "ready") { this.reason = "listening"; this.emitStatus(); }
        if (event.type === "wake") this.onWake();
      }
    });
    child.once("error", () => { if (this.process === child) { this.process = null; this.reason = "wake-word-engine-unavailable"; this.emitStatus(); } });
    child.once("exit", (code) => { if (this.process === child) { this.process = null; this.reason = code === 3 ? "wake-word-zh-cn-recognizer-missing" : this.desiredEnabled ? "wake-word-listener-stopped" : "wake-word-disabled"; this.emitStatus(); } });
    this.emitStatus();
    return { ok: true, status: this.status() };
  }

  async pause(reason = "foreground-audio-active") {
    const child = this.process;
    this.process = null;
    this.reason = String(reason || "foreground-audio-active").slice(0, 80);
    if (child) try { child.kill(); } catch { /* already stopped */ }
    this.emitStatus();
    return { ok: true, paused: Boolean(child), status: this.status() };
  }

  async stop() {
    this.desiredEnabled = false;
    const result = await this.pause("wake-word-disabled");
    return { ...result, alreadyStopped: !result.paused, status: this.status() };
  }
}

module.exports = { LISTENER_SCRIPT, PROBE_SCRIPT, WAKE_WORD_ADAPTER_VERSION, WindowsSpeechWakeWordAdapter, cleanPhrases, encodedCommand };
