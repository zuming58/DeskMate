const { spawn } = require("child_process");

const WAKE_WORD_ADAPTER_VERSION = "windows-speech-wake-v3";
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
  "$normalizedPhrases = @($phrases | ForEach-Object { ([string]$_ -replace '[^\\p{L}\\p{Nd}]', '').ToLowerInvariant() } | Where-Object { $_ })",
  "$choices = New-Object System.Speech.Recognition.Choices",
  "$choices.Add([string[]]$phrases)",
  "$builder = New-Object System.Speech.Recognition.GrammarBuilder",
  "$builder.Culture = $recognizer.Culture",
  "$builder.Append($choices)",
  "$grammar = New-Object System.Speech.Recognition.Grammar($builder)",
  "$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizer)",
  "$grammar.Name = 'bounded-exact'",
  "$engine.LoadGrammar($grammar)",
  "$dictation = $null",
  "if ($env:DESKMATE_WAKE_AUDIO_MODE -ne 'stdin-pcm16') { try { $dictation = New-Object System.Speech.Recognition.DictationGrammar; $dictation.Name = 'local-fallback'; $engine.LoadGrammar($dictation) } catch { $dictation = $null } }",
  "$threshold = [Double]::Parse($env:DESKMATE_WAKE_CONFIDENCE, [Globalization.CultureInfo]::InvariantCulture)",
  "$fallbackThreshold = [Math]::Max(0.42, $threshold)",
  "function Publish-WakeResult($result) { $heard = ([string]$result.Text -replace '[^\\p{L}\\p{Nd}]', '').ToLowerInvariant(); $matched = $false; foreach ($phrase in $normalizedPhrases) { if ($phrase -and $heard.Contains($phrase)) { $matched = $true; break } }; $required = if ($result.Grammar.Name -eq 'bounded-exact') { $threshold } else { $fallbackThreshold }; if ($matched -and $result.Confidence -ge $required) { [Console]::Out.WriteLine('{\"type\":\"wake\"}') } else { [Console]::Out.WriteLine('{\"type\":\"rejected\"}') } }",
  "if ($env:DESKMATE_WAKE_AUDIO_MODE -eq 'stdin-pcm16') {",
  "  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)",
  "  $input = [Console]::OpenStandardInput()",
  "  $hopBytes = 32000",
  "  $chunks = @()",
  "  [Console]::Out.WriteLine('{\"type\":\"ready\"}')",
  "  while ($true) {",
  "    $hop = New-Object byte[] $hopBytes",
  "    $offset = 0",
  "    while ($offset -lt $hopBytes) { $read = $input.Read($hop, $offset, $hopBytes - $offset); if ($read -le 0) { exit 0 }; $offset += $read }",
  "    [Console]::Out.WriteLine('{\"type\":\"audio-window\"}')",
  "    $chunks += ,$hop",
  "    if ($chunks.Count -gt 3) { $chunks = @($chunks[($chunks.Count - 3)..($chunks.Count - 1)]) }",
  "    if ($chunks.Count -lt 2) { continue }",
  "    $total = ($chunks | ForEach-Object { $_.Length } | Measure-Object -Sum).Sum",
  "    $window = New-Object byte[] $total",
  "    $cursor = 0",
  "    foreach ($part in $chunks) { [Buffer]::BlockCopy($part, 0, $window, $cursor, $part.Length); $cursor += $part.Length }",
  "    $memory = [System.IO.MemoryStream]::new($window, $false)",
  "    try { $engine.SetInputToAudioStream($memory, $format); $result = $engine.Recognize(); if ($null -ne $result) { [Console]::Out.WriteLine('{\"type\":\"heard\"}'); Publish-WakeResult $result } } finally { $engine.SetInputToNull(); $memory.Dispose() }",
  "  }",
  "} else {",
  "  $engine.add_SpeechDetected({ [Console]::Out.WriteLine('{\"type\":\"heard\"}') })",
  "  $engine.add_SpeechRecognitionRejected({ [Console]::Out.WriteLine('{\"type\":\"rejected\"}') })",
  "  $engine.add_SpeechRecognized({ param($sender, $args); Publish-WakeResult $args.Result })",
  "  $engine.SetInputToDefaultAudioDevice()",
  "  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)",
  "  [Console]::Out.WriteLine('{\"type\":\"ready\"}')",
  "  while ($true) { Start-Sleep -Milliseconds 250 }",
  "}",
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
  constructor({ platform = process.platform, spawnImpl = spawn, onWake = () => {}, onStatus = () => {}, onInputStart = () => {}, onInputStop = () => {}, externalAudio = false, confidence = 0.32, now = () => Date.now(), wakeDebounceMs = 3000, schedule = setTimeout, cancelSchedule = clearTimeout } = {}) {
    this.platform = platform;
    this.spawnImpl = spawnImpl;
    this.onWake = onWake;
    this.onStatus = onStatus;
    this.onInputStart = onInputStart;
    this.onInputStop = onInputStop;
    this.externalAudio = externalAudio === true;
    this.confidence = Math.max(0.25, Math.min(0.95, Number(confidence) || 0.32));
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
    this.engineReady = false;
    this.heardCount = 0;
    this.rejectedCount = 0;
    this.wakeCount = 0;
    this.audioWindowCount = 0;
    this.lastHeardAt = null;
    this.lastStatusEmitAt = 0;
    this.reason = this.available ? "wake-word-engine-not-probed" : "wake-word-windows-only";
  }

  status() {
    const enabled = Boolean(this.process) && this.inputReady && this.engineReady;
    const reason = this.process ? !this.inputReady ? this.reason : this.engineReady ? "listening" : "wake-word-engine-starting" : this.reason;
    return Object.freeze({ version: WAKE_WORD_ADAPTER_VERSION, available: this.available && this.probed, enabled, desiredEnabled: this.desiredEnabled, reason, mode: "background-local", inputMode: this.externalAudio ? "deskmate-selected-microphone" : "windows-system-default", capsuleVisible: false, localOnly: true, optInRequired: true, visibleMicrophoneRequired: true, foregroundAudioOwnerRequired: true, audioWindowCount: this.audioWindowCount, heardCount: this.heardCount, rejectedCount: this.rejectedCount, wakeCount: this.wakeCount, lastHeardAt: this.lastHeardAt });
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
    this.engineReady = false;
    const environment = { DESKMATE_WAKE_PHRASES: Buffer.from(JSON.stringify(this.phrases), "utf8").toString("base64"), DESKMATE_WAKE_CONFIDENCE: this.confidence.toFixed(2), DESKMATE_WAKE_AUDIO_MODE: this.externalAudio ? "stdin-pcm16" : "default-device" };
    const child = this.spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(LISTENER_SCRIPT)], { windowsHide: true, env: { ...process.env, ...environment } });
    this.process = child;
    this.reason = this.externalAudio ? "wake-word-microphone-starting" : "starting";
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
      for (const line of lines) {
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "ready") { this.engineReady = true; this.reason = this.inputReady ? "listening" : "wake-word-microphone-starting"; this.emitStatus(); }
        if (event.type === "audio-window") {
          this.audioWindowCount += 1;
          if (this.audioWindowCount % 5 === 0) this.emitStatus();
        }
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
      this.engineReady = false;
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
    this.reason = this.engineReady ? "listening" : "wake-word-engine-starting";
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
    this.engineReady = false;
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
