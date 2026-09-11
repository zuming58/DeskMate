// Explicit opt-in only: configured cloud services, synthetic text, no mic, no
// speakers, no memory writes. Prints durations/counts, never service responses.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const { createSecureAiServiceStore } = require('../electron/secure-ai-services.cjs');
const { createSecureBailianStore } = require('../electron/secure-bailian.cjs');
const { createKnowledgeOsSettings } = require('../electron/knowledgeos-settings.cjs');
const { KnowledgeOsMcpClient } = require('../electron/knowledgeos-mcp-client.cjs');
const { KnowledgeOsMemoryGateway } = require('../electron/memory-journal-service.cjs');
const { OpenAiStreamingCompanionModelAdapter } = require('../electron/companion-model-adapter.cjs');
const { CompanionSpeechSegmenter } = require('../electron/companion-speech-segmenter.cjs');
const { DoubaoStreamingTtsAdapter } = require('../electron/streaming-tts-adapter.cjs');
const { BailianStreamingAsrAdapter } = require('../electron/streaming-asr-adapter.cjs');

if (!process.argv.includes('--live')) { console.log('Explicit --live is required.'); app.exit(2); }
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmate-latency-probe-'));
const isolatedProfile = path.join(output, 'isolated-profile');
const userDataPath = path.join(process.env.APPDATA, 'deskmate');
fs.mkdirSync(isolatedProfile);
// Chromium's OS-encrypted key is profile-specific. Only copy its wrapped key;
// never mutate the running app profile or copy histories/credentials to fixtures.
const localState = JSON.parse(fs.readFileSync(path.join(userDataPath, 'Local State'), 'utf8'));
fs.writeFileSync(path.join(isolatedProfile, 'Local State'), JSON.stringify({ os_crypt: localState.os_crypt }), { mode: 0o600 });
app.setPath('userData', isolatedProfile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { schema: 'deskmate.synthetic-service-latency.v1', samples: [], asr: [] };
const emit = value => { console.log(JSON.stringify(value)); fs.writeFileSync(path.join(output, 'timings.json'), JSON.stringify(report, null, 2)); };
app.whenReady().then(async () => {
  const ai = createSecureAiServiceStore({ safeStorage, userDataPath });
  const bailian = createSecureBailianStore({ safeStorage, userDataPath });
  const settings = createKnowledgeOsSettings({ safeStorage, userDataPath });
  report.stage = 'load-services';
  emit({ textConfigured: ai.status().text.configured, realtimeConfigured: ai.status().realtime.configured, asrConfigured: bailian.status().configured, knowledgeConfigured: settings.status().configured });
  const client = new KnowledgeOsMcpClient({ settings, timeoutMs: 5000, spawnProcess: (...args) => {
    const child = require('child_process').spawn(...args);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-16000); });
    child.on('exit', code => {
      if (code && stderr) emit({ adapterExitCode: code, startupCategory: /Credential is unavailable/.test(stderr) ? 'credential-unavailable' : /runtime descriptor|runtime.json/.test(stderr) ? 'runtime-descriptor' : /Core health/.test(stderr) ? 'core-health-mismatch' : /WinError 10061|ConnectError|refused.*connection/i.test(stderr) ? 'core-not-running' : /proxy/.test(stderr) ? 'proxy' : 'unclassified-startup-error' });
      stderr = '';
    });
    return child;
  } });
  if (process.argv.includes('--lookup-only')) {
    for (const name of ['health.get_summary', 'knowledge.search']) {
      const started = performance.now();
      const result = await client.callTool(name, name === 'knowledge.search' ? { query: '备份与恢复演练的闭环', retrieval_mode: 'hybrid', scope: ['wiki', 'agent_memory'], limit: 8, include_snippets: true } : {});
      emit({ tool: name, ok: result.ok, reason: result.reason || '', elapsedMs: Math.round(performance.now() - started), count: result.data?.results?.length ?? result.data?.items?.length ?? null });
    }
    return;
  }
  const gateway = new KnowledgeOsMemoryGateway({ settings, client });
  const { CompanionMemoryStore } = require('../electron/companion-memory.cjs');
  const { DatabaseSync } = require('node:sqlite');
  const local = Object.create(CompanionMemoryStore.prototype);
  local.now = Date.now;
  local.db = new DatabaseSync(path.join(userDataPath, 'companion-memory.sqlite3'), { readOnly: true });
  try {
    const started = performance.now();
    const accepted = local.searchLongTermMemory({ query: '以前项目恢复演练' });
    const historical = local.localHistoryForQuery('以前项目恢复演练');
    report.localRecall = { elapsedMs: Math.round(performance.now() - started), reviewedHits: accepted.length, historicalHits: historical.length };
    emit(report.localRecall);
  } finally { local.db.close(); }
  const config = ai.status().text.configured ? ai.loadTextSecret() : { ...bailian.loadSecret(), provider: 'bailian' };
  emit({ model: String(config.model || config.companionModel || 'qwen3.7-flash').slice(0, 120), provider: config.provider });
  const tts = new DoubaoStreamingTtsAdapter({ config: ai.loadRealtimeSecret() });
  try {
    report.stage = 'tts-connect';
    await tts.connect();
    report.stage = 'model-turns';
    for (let i = 0; i < 3; i++) {
      const timing = { sample: i + 1, knowledgeCalls: 0, retrievalMs: 0 };
      const segmenter = new CompanionSpeechSegmenter();
      const start = performance.now();
      const elapsed = () => Math.round(performance.now() - start);
      let speech;
      const first = segments => {
        if (speech || !segments.length) return;
        timing.firstTtsRequestMs = elapsed();
        speech = tts.synthesize(segments[0], { onAudio: () => { timing.firstAudioMs ??= elapsed(); } });
        speech.catch(() => {});
      };
      const model = new OpenAiStreamingCompanionModelAdapter({
        config,
        readKnowledgeContext: async (text, options) => {
          timing.knowledgeCalls++;
          const retrievalStart = performance.now();
          const result = await gateway.searchEvidence(text, options);
          timing.retrievalMs = Math.round(performance.now() - retrievalStart);
          return result;
        },
        fetchImpl: (...args) => { timing.httpStartedMs = elapsed(); timing.thinkingDisabled = JSON.parse(args[1].body).thinking?.type === 'disabled'; return fetch(...args); },
      });
      try {
        const result = await model.streamTurn({ text: '你好，请用一句话说说今天我们可以怎样高效工作。', onDelta: delta => { timing.firstDeltaMs ??= elapsed(); first(segmenter.push(delta)); } });
        first(segmenter.finish(result.text));
        await speech;
        timing.ok = Boolean(timing.firstAudioMs);
      } finally { model.close(); }
      report.samples.push(timing); emit(timing);
    }
    const remoteStart = performance.now();
    let evidence = [], lookupOk = true;
    try { evidence = await gateway.searchEvidence('备份与恢复演练的闭环'); } catch { lookupOk = false; }
    report.explicitLookup = { ok: lookupOk, elapsedMs: Math.round(performance.now() - remoteStart), evidenceCount: evidence.length };
    emit(report.explicitLookup);
    if (process.argv.includes('--asr')) {
      const chunks = [];
      await tts.synthesize('你好，请用一句话介绍你能帮我做什么。', { onAudio: audio => chunks.push(audio) });
      const source = Buffer.concat(chunks);
      // 24k -> 16k synthetic PCM resampling, no retained audio files.
      const pcm = Buffer.alloc(Math.floor(source.length / 2 * 2 / 3) * 2);
      for (let i = 0; i < pcm.length / 2; i++) {
        const position = i * 1.5, a = Math.floor(position), b = Math.min(a + 1, source.length / 2 - 1);
        pcm.writeInt16LE(Math.round(source.readInt16LE(a * 2) * (1 - position + a) + source.readInt16LE(b * 2) * (position - a)), i * 2);
      }
      for (const silenceDurationMs of [4000, 1500]) {
        let finalAt = null, audioEnd = null, speechStarted = null, started = 0, failed = false;
        const adapter = new BailianStreamingAsrAdapter({ config: bailian.loadSecret(), silenceDurationMs, onEvent: event => {
          if (event.type === 'final') finalAt ??= performance.now();
          if (event.type === 'speech.stopped') audioEnd = event.audioEndMs;
          if (event.type === 'speech.started') speechStarted = event.audioStartMs;
          if (event.type === 'error') failed = true;
        } });
        try {
          await adapter.connect(); started = performance.now();
          const padded = Buffer.concat([Buffer.alloc(6400), pcm, Buffer.alloc((silenceDurationMs + 4000) * 32)]);
          for (let offset = 0; offset < padded.length && !finalAt && !failed; offset += 640) {
            adapter.sendAudio(padded.subarray(offset, offset + 640));
            await sleep(Math.max(0, started + (offset + 640) / 32 - performance.now()));
          }
          const result = { silenceDurationMs, recognized: finalAt !== null, speechDetected: speechStarted !== null, afterSyntheticBufferEndMs: finalAt === null ? null : Math.round(finalAt - started - (pcm.length + 6400) / 32), providerAudioEndMs: audioEnd };
          report.asr.push(result); emit(result);
        } finally { adapter.close(); }
      }
      source.fill(0); pcm.fill(0); chunks.forEach(chunk => chunk.fill(0));
    }
    emit({ complete: true, reportPath: path.join(output, 'timings.json') });
  } finally { tts.close(); }
}).then(() => app.exit(0)).catch(error => { emit({ failed: true, stage: report.stage, reason: /^(three-stage|knowledgeos)-[a-z-]+$/.test(error?.message || '') ? error.message : 'synthetic-service-probe-failed', reportPath: path.join(output, 'timings.json') }); app.exit(1); });
