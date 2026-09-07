const { spawn } = require("child_process");

const WAKE_WORD_ADAPTER_VERSION = "windows-speech-wake-v1";
const SEEKABLE_STDIN_STREAM_CSHARP = [
  "using System;",
  "using System.IO;",
  "public sealed class DeskMateWakeInputStream : Stream {",
  "  private readonly Stream inner;",
  "  private long position;",
  "  public DeskMateWakeInputStream(Stream input) { if (input == null) throw new ArgumentNullException(\"input\"); inner = input; }",
  "  public override bool CanRead { get { return true; } }",
  "  public override bool CanSeek { get { return true; } }",
  "  public override bool CanWrite { get { return false; } }",
  "  public override long Length { get { return long.MaxValue; } }",
  "  public override long Position { get { return position; } set { if (value != position) throw new NotSupportedException(); } }",
  "  public override void Flush() { }",
  "  public override int Read(byte[] buffer, int offset, int count) { int read = inner.Read(buffer, offset, count); position += read; return read; }",
  "  public override long Seek(long offset, SeekOrigin origin) {",
  "    long target = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.Current ? position + offset : long.MaxValue + offset;",
  "    if (target != position) throw new NotSupportedException();",
  "    return position;",
  "  }",
  "  public override void SetLength(long value) { throw new NotSupportedException(); }",
  "  public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }",
  "}",
].join("\n");
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
  "$engine.add_SpeechDetected({ [Console]::Out.WriteLine('{\"type\":\"heard\"}') })",
  "$engine.add_SpeechRecognitionRejected({ [Console]::Out.WriteLine('{\"type\":\"rejected\"}') })",
  "$engine.add_SpeechRecognized({ param($sender, $args); if ($args.Result.Confidence -ge $threshold) { [Console]::Out.WriteLine('{\"type\":\"wake\"}') } else { [Console]::Out.WriteLine('{\"type\":\"rejected\"}') } })",
  "if ($env:DESKMATE_WAKE_AUDIO_MODE -eq 'stdin-pcm16') { $streamSource = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DESKMATE_WAKE_STREAM_TYPE)); Add-Type -TypeDefinition $streamSource; $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); $wakeInput = [DeskMateWakeInputStream]::new([Console]::OpenStandardInput()); $engine.SetInputToAudioStream($wakeInput, $format) } else { $engine.SetInputToDefaultAudioDevice() }",
  "$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)",
  "[Console]::Out.WriteLine('{\"type\":\"ready\"}')",
  "while ($true) { Start-Sleep -Milliseconds 250 }",
].join("; ");

function encodedCommand(script) {
  return Buffer.from(String(script || ""), "utf16le").toString("base64");
}

function cleanPhrases(value) {
  if (!Array.isArray(value)) return [];
  const phrases = [];
  for (const item of value) {
    const phrase = String(item || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 64);
    if (!phrase) continue;
    phrases.push(phrase);
    const compact = phrase.replace(/[\s，,。！？!?、]+/g, "");
    if (compact && compact !== phrase) phrases.push(compact);
  }
  return [...new Set(phrases)].slice(0, 8);
}

class WindowsSpeechWakeWordAdapter {
  constructor({ platform = process.platform, spawnImpl = spawn, onWake = () => {}, onStatus = () => {}, onInputStart = () => {}, onInputStop = () => {}, externalAudio = false, confidence = 0.5, now = () => Date.now(), wakeDebounceMs = 3000, schedule = setTimeout, cancelSchedule = clearTimeout } = {}) {
    this.platform = platform;
    this.spawnImpl = spawnImpl;
    this.onWake = onWake;
    this.onStatus = onStatus;
    this.onInputStart = onInputStart;
    this.onInputStop = onInputStop;
    this.externalAudio = externalAudio === true;
    this.confidence = Math.max(0.5, Math.min(0.95, Number(confidence) || 0.5));
    this.now = now;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.wakeDebounceMs = Math.max(1000, Math.min(10000, Number(wakeDebounceMs) || 3000));
    this.lastWakeAt = null;
    this.available = platform === "win32";
    this.probed = false;
    this.desiredEnabled = false;
    this.process = null;
    this.phrases = [];
    this.configurationDirty = false;
    this.restartTimer = null;
    this.restartAttempts = 0;
    this.inputReady = !this.externalAudio;
    this.heardCount = 0;
    this.rejectedCount = 0;
    this.wakeCount = 0;
    this.lastHeardAt = null;
    this.lastStatusEmitAt = 0;
    this.reason = this.available ? "wake-word-engine-not-probed" : "wake-word-windows-only";
  }

  status() {
    return Object.freeze({ version: WAKE_WORD_ADAPTER_VERSION, available: this.available && this.probed, enabled: Boolean(this.process) && this.inputReady, desiredEnabled: this.desiredEnabled, reason: this.process ? this.inputReady ? "listening" : this.reason : this.reason, mode: "background-local", inputMode: this.externalAudio ? "deskmate-selected-microphone" : "windows-system-default", capsuleVisible: false, localOnly: true, optInRequired: true, visibleMicrophoneRequired: true, foregroundAudioOwnerRequired: true, heardCount: this.heardCount, rejectedCount: this.rejectedCount, wakeCount: this.wakeCount, lastHeardAt: this.lastHeardAt });
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
    const nextPhrases = cleanPhrases(phrases);
    const phrasesChanged = nextPhrases.length !== this.phrases.length || nextPhrases.some((phrase, index) => phrase !== this.phrases[index]);
    this.desiredEnabled = enabled === true;
    this.phrases = nextPhrases;
    if (phrasesChanged) {
      this.restartAttempts = 0;
      if (this.process) this.configurationDirty = true;
    }
    if (!this.desiredEnabled) this.reason = "wake-word-disabled";
    this.emitStatus();
    return this.status();
  }

  async start({ phrases, retry = false } = {}) {
    if (!retry) this.restartAttempts = 0;
    if (phrases) this.phrases = cleanPhrases(phrases);
    if (!this.probed) await this.probe();
    if (!this.available) return { ok: false, reason: this.reason, status: this.status() };
    if (!this.desiredEnabled) return { ok: false, reason: "wake-word-disabled", status: this.status() };
    if (!this.phrases.length) return { ok: false, reason: "wake-word-phrase-empty", status: this.status() };
    if (this.process && !this.configurationDirty) return { ok: true, alreadyStarted: true, status: this.status() };
    if (this.process) await this.pause("wake-word-configuration-changed");
    this.configurationDirty = false;
    this.lastWakeAt = null;
    this.inputReady = !this.externalAudio;
    const environment = { DESKMATE_WAKE_PHRASES: Buffer.from(JSON.stringify(this.phrases), "utf8").toString("base64"), DESKMATE_WAKE_CONFIDENCE: this.confidence.toFixed(2), DESKMATE_WAKE_AUDIO_MODE: this.externalAudio ? "stdin-pcm16" : "default-device", DESKMATE_WAKE_STREAM_TYPE: this.externalAudio ? Buffer.from(SEEKABLE_STDIN_STREAM_CSHARP, "utf8").toString("base64") : "" };
    const child = this.spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(LISTENER_SCRIPT)], { windowsHide: true, env: { ...process.env, ...environment } });
    this.process = child;
    this.reason = this.externalAudio ? "wake-word-microphone-starting" : "starting";
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
      for (const line of lines) {
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "ready") { this.reason = "listening"; this.emitStatus(); }
        if (event.type === "heard") {
          this.heardCount += 1;
          this.lastHeardAt = new Date(this.now()).toISOString();
          const at = this.now();
          if (at - this.lastStatusEmitAt >= 500) { this.lastStatusEmitAt = at; this.emitStatus(); }
        }
        if (event.type === "rejected") { this.rejectedCount += 1; this.emitStatus(); }
        if (event.type === "wake") {
          const at = this.now();
          if (this.lastWakeAt === null || at - this.lastWakeAt >= this.wakeDebounceMs) { this.lastWakeAt = at; this.wakeCount += 1; this.emitStatus(); this.onWake(); }
        }
      }
    });
    const unexpectedStop = (reason) => {
      if (this.process !== child) return;
      this.process = null;
      this.inputReady = !this.externalAudio;
      this.reason = reason;
      if (this.externalAudio) this.onInputStop();
      this.emitStatus();
      this.scheduleRestart();
    };
    child.once("error", () => unexpectedStop("wake-word-engine-unavailable"));
    child.once("exit", (code) => unexpectedStop(code === 3 ? "wake-word-zh-cn-recognizer-missing" : this.desiredEnabled ? "wake-word-listener-stopped" : "wake-word-disabled"));
    child.stdin?.on?.("error", () => {
      unexpectedStop("wake-word-audio-pipe-closed");
      try { child.kill(); } catch { /* already stopped */ }
    });
    if (this.externalAudio) this.onInputStart();
    this.emitStatus();
    return { ok: true, status: this.status() };
  }

  markInputReady() {
    if (!this.process || !this.externalAudio) return false;
    this.inputReady = true;
    this.reason = "listening";
    this.emitStatus();
    return true;
  }

  writeAudio(value) {
    const chunk = Buffer.from(value || []);
    const child = this.process;
    const input = child?.stdin;
    if (!child || !this.externalAudio || !this.inputReady || !input?.write || input.destroyed || input.writableEnded || input.writable === false || !chunk.length || chunk.length > 64 * 1024 || chunk.length % 2 !== 0) return false;
    try { input.write(chunk); return true; }
    catch { return false; }
  }

  inputError(reason = "wake-word-microphone-unavailable") {
    if (!this.process || !this.externalAudio) return false;
    this.inputReady = false;
    this.reason = String(reason || "wake-word-microphone-unavailable").slice(0, 80);
    this.emitStatus();
    return true;
  }

  scheduleRestart() {
    if (!this.desiredEnabled || !this.available || !this.phrases.length || this.restartTimer || this.restartAttempts >= 3) return false;
    this.restartAttempts += 1;
    const delay = 500 * (2 ** (this.restartAttempts - 1));
    this.reason = "wake-word-restarting";
    this.emitStatus();
    this.restartTimer = this.schedule(async () => {
      this.restartTimer = null;
      const result = await this.start({ retry: true });
      if (!result.ok) this.scheduleRestart();
    }, delay);
    return true;
  }

  async pause(reason = "foreground-audio-active") {
    if (this.restartTimer) this.cancelSchedule(this.restartTimer);
    this.restartTimer = null;
    const child = this.process;
    this.process = null;
    this.inputReady = !this.externalAudio;
    this.configurationDirty = false;
    this.reason = String(reason || "foreground-audio-active").slice(0, 80);
    if (this.externalAudio) this.onInputStop();
    if (child) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
        const timer = setTimeout(finish, 750);
        child.once?.("exit", finish);
        try { child.kill(); } catch { finish(); }
      });
    }
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
