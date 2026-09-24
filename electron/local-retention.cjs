const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { normalizeMemoryPolicy } = require("./companion-memory-policy.cjs");

const DAY = 86_400_000;
const PREVIEW_TTL = 10 * 60_000;
const RECOVERY_TTL = 7 * DAY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
});

function fail(code) { throw new Error(`retention-${code}`); }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const pending = `${file}.${randomUUID()}.pending`;
  fs.writeFileSync(pending, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(pending, file);
}
function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function localDay(at) {
  const value = new Date(at);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function publicHeld(held) {
  return Object.fromEntries(Object.entries(held).filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b)));
}

class LocalRetention {
  constructor({ userDataPath, now = () => Date.now() } = {}) {
    if (!path.isAbsolute(String(userDataPath || ""))) fail("root-invalid");
    this.root = path.resolve(userDataPath);
    this.now = now;
    this.stateFile = path.join(this.root, "retention-state.json");
    this.recoveryRoot = path.join(this.root, "recovery", "retention");
    this.previewRoot = path.join(this.recoveryRoot, "previews");
    this.jobRoot = path.join(this.recoveryRoot, "jobs");
    this.trashRoot = path.join(this.recoveryRoot, "trash");
    for (const directory of [this.previewRoot, this.jobRoot, this.trashRoot]) fs.mkdirSync(directory, { recursive: true });
  }

  state() {
    const value = readJson(this.stateFile, {});
    return {
      version: 1,
      enabled: value.enabled === true,
      activatedAt: Number(value.activatedAt) || null,
      lastRunAt: Number(value.lastRunAt) || null,
      lastResult: value.lastResult && typeof value.lastResult === "object" ? value.lastResult : null,
    };
  }
  saveState(value) { atomicJson(this.stateFile, value); return value; }
  policy() { return normalizeMemoryPolicy(readJson(path.join(this.root, "companion-memory-policy.json"), {})); }
  syncRequired() { return readJson(path.join(this.root, "knowledgeos-settings.json"), {})?.syncEnabled === true; }
  historyDb(readOnly = true) {
    const file = path.join(this.root, "voice-history.sqlite3");
    if (!fs.existsSync(file)) return null;
    const db = new DatabaseSync(file, { readOnly });
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") { db.close(); fail("history-corrupt"); }
    return db;
  }
  memoryDb(readOnly = true) {
    const file = path.join(this.root, "companion-memory.sqlite3");
    if (!fs.existsSync(file)) return null;
    const db = new DatabaseSync(file, { readOnly });
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") { db.close(); fail("memory-corrupt"); }
    return db;
  }
  jobFile(id) { if (!UUID.test(String(id))) fail("job-invalid"); return path.join(this.jobRoot, `${id}.json`); }
  previewFile(id) { if (!UUID.test(String(id))) fail("preview-invalid"); return path.join(this.previewRoot, `${id}.json`); }
  trashDirectory(id) { if (!UUID.test(String(id))) fail("job-invalid"); return path.join(this.trashRoot, id); }

  collect(at = this.now()) {
    const policy = this.policy();
    const syncRequired = this.syncRequired();
    const audioCutoff = at - policy.audioRetentionDays * DAY;
    const textCutoff = at - policy.rawRetentionDays * DAY;
    const held = {};
    const hold = (reason) => { held[reason] = (held[reason] || 0) + 1; };
    const historyDelete = [], audioDelete = [], memoryDelete = [];
    let history = null, memory = null;
    try {
      history = this.historyDb(true);
      memory = this.memoryDb(true);
      const turns = new Map();
      const journals = new Map();
      const accepted = new Map();
      if (memory) {
        for (const row of memory.prepare("SELECT id, source_event_id AS sourceEventId, created_at AS createdAt, workday_day AS workdayDay, summary_day AS summaryDay FROM conversation_turns").all()) {
          if (row.sourceEventId) turns.set(row.sourceEventId, row);
        }
        for (const row of memory.prepare("SELECT day, status FROM memory_daily_journals").all()) journals.set(row.day, row.status);
        for (const row of memory.prepare("SELECT o.day, o.memory_class AS memoryClass, o.status, m.value AS sealed FROM memory_journal_outbox o LEFT JOIN companion_memory_meta m ON m.key='journal-sync:sealed:' || o.id").all()) {
          if (row.status === "accepted" && row.sealed > 0) (accepted.get(row.day) || accepted.set(row.day, new Set()).get(row.day)).add(row.memoryClass);
        }
      }
      const readyDay = (day) => {
        if (!day || journals.get(day) !== "completed") return "daily-summary-incomplete";
        if (syncRequired) {
          const classes = accepted.get(day);
          if (!classes?.has("work") || !classes?.has("personal")) return "knowledgeos-sync-pending";
        }
        return "";
      };
      const linkedReason = (eventId) => {
        if (!eventId) return "";
        const turn = turns.get(eventId);
        if (!turn) return "memory-link-missing";
        if (turn.summaryDay !== turn.workdayDay) return 'raw-summary-incomplete';
        return readyDay(turn.workdayDay);
      };

      const historyRows = history ? history.prepare("SELECT id, payload, digest, created_at AS createdAt, date_source AS dateSource, memory_event_id AS memoryEventId, audio_id AS audioId FROM history").all() : [];
      const historyByAudio = new Map();
      for (const row of historyRows) if (row.audioId) (historyByAudio.get(row.audioId) || historyByAudio.set(row.audioId, []).get(row.audioId)).push(row);
      const eligibleAudio = new Set();
      const audioRows = history ? history.prepare("SELECT id, digest, size, mime, created_at AS createdAt FROM audio").all() : [];
      for (const audio of audioRows) {
        const refs = historyByAudio.get(audio.id) || [];
        if (!Number.isFinite(audio.createdAt)) { hold("date-unknown"); continue; }
        if (audio.createdAt > audioCutoff) continue;
        if (!refs.length) { hold("orphan-recovery-required"); continue; }
        let reason = "";
        for (const row of refs) {
          let payload;
          try {
            if (sha(row.payload) !== row.digest) { reason = "history-integrity-failed"; break; }
            payload = JSON.parse(row.payload);
          } catch { reason = "history-integrity-failed"; break; }
          if (payload?.transcription?.status !== "success") { reason = "transcription-not-successful"; break; }
          if (row.dateSource === "unknown" || !Number.isFinite(row.createdAt)) { reason = "date-unknown"; break; }
          reason = linkedReason(row.memoryEventId);
          if (reason) break;
        }
        if (reason) { hold(reason); continue; }
        eligibleAudio.add(audio.id);
        audioDelete.push({ id: audio.id, digest: audio.digest, createdAt: audio.createdAt, size: audio.size, refs: refs.map((row) => ({ id: row.id, digest: row.digest, createdAt: row.createdAt })) });
      }

      for (const row of historyRows) {
        if (!Number.isFinite(row.createdAt) || row.dateSource === "unknown") { if (row.createdAt == null) hold("date-unknown"); continue; }
        if (row.createdAt > textCutoff) continue;
        let payload;
        try {
          if (sha(row.payload) !== row.digest) { hold("history-integrity-failed"); continue; }
          payload = JSON.parse(row.payload);
        } catch { hold("history-integrity-failed"); continue; }
        if (payload?.transcription?.status !== "success") { hold("transcription-not-successful"); continue; }
        const reason = linkedReason(row.memoryEventId);
        if (reason) { hold(reason); continue; }
        if (row.audioId && !eligibleAudio.has(row.audioId)) { hold("recording-retention-pending"); continue; }
        historyDelete.push({ id: row.id, digest: row.digest, createdAt: row.createdAt, audioId: row.audioId || null });
      }

      if (memory) {
        for (const row of memory.prepare("SELECT id, source_event_id AS sourceEventId, created_at AS createdAt, workday_day AS workdayDay, summary_day AS summaryDay FROM conversation_turns WHERE created_at<=?").all(textCutoff)) {
          const reason = row.summaryDay !== row.workdayDay ? 'raw-summary-incomplete' : readyDay(row.workdayDay);
          if (reason) { hold(reason); continue; }
          memoryDelete.push(row);
        }
      }
    } finally { history?.close(); memory?.close(); }
    const candidates = { historyDelete, audioDelete, memoryDelete };
    return {
      version: 1, previewAt: at, expiresAt: at + PREVIEW_TTL,
      policy: { audioRetentionDays: policy.audioRetentionDays, rawRetentionDays: policy.rawRetentionDays },
      cutoffs: { audio: audioCutoff, text: textCutoff }, syncRequired,
      candidates, held: publicHeld(held), fingerprint: sha(stable(candidates)),
    };
  }

  publicResult(preview, token = null) {
    return {
      ok: true, token,
      previewAt: preview.previewAt, expiresAt: preview.expiresAt,
      policy: preview.policy,
      cutoffs: preview.cutoffs,
      eligible: { recordings: preview.candidates.audioDelete.length, historyText: preview.candidates.historyDelete.length, memoryTurns: preview.candidates.memoryDelete.length },
      held: preview.held,
    };
  }

  preview() {
    const value = this.collect();
    const token = randomUUID();
    atomicJson(this.previewFile(token), value);
    return this.publicResult(value, token);
  }

  status() {
    this.purgeExpired();
    const state = this.state();
    const pendingJobs = fs.readdirSync(this.jobRoot).filter((name) => UUID.test(name.replace(/\.json$/, ""))).map((name) => readJson(path.join(this.jobRoot, name))).filter((job) => job && job.phase !== "completed");
    return { ok: true, ...state, policy: this.policy(), pending: pendingJobs.length, pendingBrowserCleanup: pendingJobs.filter((job) => job.phase === "browser-pending").map((job) => this.publicJob(job)) };
  }

  publicJob(job) {
    return { jobId: job.id, historyIds: job.browser?.historyIds || [], audioIds: job.browser?.audioIds || [], phase: job.phase };
  }

  confirm({ token } = {}) {
    const file = this.previewFile(token);
    const preview = readJson(file);
    if (!preview || preview.version !== 1 || preview.expiresAt < this.now()) fail("preview-expired");
    const current = this.collect(preview.previewAt);
    if (current.fingerprint !== preview.fingerprint || stable(current.policy) !== stable(preview.policy) || current.syncRequired !== preview.syncRequired) fail("preview-changed");
    const job = this.prepareJob(preview);
    const result = this.resume(job);
    const state = this.state();
    this.saveState({ ...state, enabled: true, activatedAt: state.activatedAt || this.now() });
    try { fs.unlinkSync(file); } catch { /* Expiry cleanup will remove it. */ }
    return { ...this.publicResult(preview), enabled: true, cleanup: this.publicJob(result) };
  }

  prepareJob(preview) {
    const id = randomUUID();
    const trash = this.trashDirectory(id);
    fs.mkdirSync(path.join(trash, "audio"), { recursive: true });
    let history = null, memory = null;
    try {
      history = this.historyDb(true); memory = this.memoryDb(true);
      const historyRows = [], detachedHistoryRows = [], audioRows = [], memoryRows = [], outboxRows = [];
      if (history) {
        const getHistory = history.prepare("SELECT * FROM history WHERE id=?");
        const getAudio = history.prepare("SELECT * FROM audio WHERE id=?");
        for (const item of preview.candidates.historyDelete) { const row = getHistory.get(item.id); if (row) historyRows.push(row); }
        const deletedHistoryIds = new Set(historyRows.map((row) => row.id));
        for (const item of preview.candidates.audioDelete) {
          const row = getAudio.get(item.id); if (!row) continue;
          audioRows.push(row);
          for (const linked of history.prepare("SELECT * FROM history WHERE audio_id=?").all(row.id)) if (!deletedHistoryIds.has(linked.id) && !detachedHistoryRows.some((item) => item.id === linked.id)) detachedHistoryRows.push(linked);
          const source = path.join(this.root, "voice-recordings", `${row.digest}.audio`);
          if (!fs.existsSync(source) || sha(fs.readFileSync(source)) !== row.digest) fail("audio-integrity");
          const target = path.join(trash, "audio", `${row.digest}.audio`);
          if (!fs.existsSync(target)) fs.copyFileSync(source, target);
        }
      }
      if (memory) {
        const getTurn = memory.prepare("SELECT * FROM conversation_turns WHERE id=?");
        const getOutbox = memory.prepare("SELECT * FROM companion_memory_outbox WHERE event_id=?");
        for (const item of preview.candidates.memoryDelete) {
          const row = getTurn.get(item.id); if (!row) continue;
          memoryRows.push(row);
          if (row.source_event_id) { const outbox = getOutbox.get(row.source_event_id); if (outbox) outboxRows.push(outbox); }
        }
      }
      atomicJson(path.join(trash, "rows.json"), { historyRows, detachedHistoryRows, audioRows, memoryRows, outboxRows });
      const job = { version: 1, id, phase: "prepared", createdAt: this.now(), updatedAt: this.now(), preview, browser: { historyIds: preview.candidates.historyDelete.map((row) => row.id), audioIds: preview.candidates.audioDelete.map((row) => row.id) } };
      atomicJson(this.jobFile(id), job);
      return job;
    } finally { history?.close(); memory?.close(); }
  }

  resume(job) {
    if (!job || job.version !== 1 || !UUID.test(job.id)) fail("job-invalid");
    const file = this.jobFile(job.id);
    if (job.phase === "prepared") {
      const history = this.historyDb(false);
      try {
        if (history) {
          history.exec("BEGIN IMMEDIATE");
          try {
            const removeHistory = history.prepare("DELETE FROM history WHERE id=? AND digest=?");
            for (const row of job.preview.candidates.historyDelete) removeHistory.run(row.id, row.digest);
            const removeAudio = history.prepare("DELETE FROM audio WHERE id=? AND digest=?");
            for (const row of job.preview.candidates.audioDelete) removeAudio.run(row.id, row.digest);
            const referenced = history.prepare("SELECT id, payload, digest FROM history WHERE audio_id=?");
            const update = history.prepare("UPDATE history SET payload=?, digest=?, audio_id=NULL WHERE id=? AND digest=?");
            for (const audio of job.preview.candidates.audioDelete) for (const row of referenced.all(audio.id)) {
              const payload = JSON.parse(row.payload); delete payload.audioId; payload.recordingUnavailable = true;
              const serialized = JSON.stringify(payload); update.run(serialized, sha(serialized), row.id, row.digest);
            }
            history.exec("COMMIT");
          } catch (error) { history.exec("ROLLBACK"); throw error; }
        }
      } finally { history?.close(); }
      job.phase = "history-db"; job.updatedAt = this.now(); atomicJson(file, job);
    }
    if (job.phase === "history-db") {
      const history = this.historyDb(true);
      try {
        for (const audio of job.preview.candidates.audioDelete) {
          const remaining = history?.prepare("SELECT 1 FROM audio WHERE digest=? LIMIT 1").get(audio.digest);
          if (!remaining) {
            const target = path.join(this.root, "voice-recordings", `${audio.digest}.audio`);
            if (fs.existsSync(target)) fs.unlinkSync(target);
          }
        }
      } finally { history?.close(); }
      job.phase = "history-files"; job.updatedAt = this.now(); atomicJson(file, job);
    }
    if (job.phase === "history-files") {
      const memory = this.memoryDb(false);
      try {
        if (memory) {
          memory.exec("BEGIN IMMEDIATE");
          try {
            const removeOutbox = memory.prepare("DELETE FROM companion_memory_outbox WHERE event_id=?");
            const removeTurn = memory.prepare("DELETE FROM conversation_turns WHERE id=? AND created_at=?");
            for (const row of job.preview.candidates.memoryDelete) { if (row.sourceEventId) removeOutbox.run(row.sourceEventId); removeTurn.run(row.id, row.createdAt); }
            if (job.preview.candidates.memoryDelete.length) memory.prepare("UPDATE companion_memory_meta SET value=value+1 WHERE key='revision'").run();
            memory.exec("COMMIT");
          } catch (error) { memory.exec("ROLLBACK"); throw error; }
        }
      } finally { memory?.close(); }
      job.phase = "browser-pending"; job.updatedAt = this.now(); atomicJson(file, job);
    }
    return job;
  }

  tick() {
    const state = this.state();
    if (!state.enabled) return { ok: true, skipped: true, reason: "retention-consent-required", status: this.status() };
    const pending = this.resumePending();
    if (pending) return { ok: true, skipped: true, reason: "retention-browser-cleanup-pending", cleanup: this.publicJob(pending), status: this.status() };
    if (state.lastRunAt && localDay(state.lastRunAt) === localDay(this.now())) return { ok: true, skipped: true, reason: "retention-already-ran-today", status: this.status() };
    const preview = this.collect();
    const job = this.resume(this.prepareJob(preview));
    return { ...this.publicResult(preview), enabled: true, cleanup: this.publicJob(job) };
  }

  resumePending() {
    for (const name of fs.readdirSync(this.jobRoot).sort()) {
      const id = name.replace(/\.json$/, "");
      if (!UUID.test(id)) continue;
      const job = readJson(path.join(this.jobRoot, name));
      if (!job || job.phase === "completed") continue;
      return job.phase === "browser-pending" ? job : this.resume(job);
    }
    return null;
  }

  acknowledge({ jobId } = {}) {
    const file = this.jobFile(jobId), job = readJson(file);
    if (!job || job.phase !== "browser-pending") fail("job-state-invalid");
    job.phase = "completed"; job.completedAt = this.now(); job.updatedAt = job.completedAt; atomicJson(file, job);
    const result = {
      recordings: job.preview.candidates.audioDelete.length,
      historyText: job.preview.candidates.historyDelete.length,
      memoryTurns: job.preview.candidates.memoryDelete.length,
      held: job.preview.held,
    };
    const state = this.state();
    this.saveState({ ...state, enabled: true, activatedAt: state.activatedAt || this.now(), lastRunAt: this.now(), lastResult: result });
    return { ok: true, completed: true, result, status: this.status() };
  }

  deactivate() {
    const state = this.state();
    this.saveState({ ...state, enabled: false, activatedAt: null });
    return this.status();
  }

  purgeExpired() {
    const now = this.now();
    // Restore staging/rollback copies are internal recovery, never exported files.
    // Preserve active jobs and incomplete renderer handover regardless of age.
    if(this.state().enabled) {
      const root=path.join(this.root,'recovery'), job=readJson(path.join(root,'job.json')), handover=readJson(path.join(this.root,'restored-ui-state.json'));
      for(const name of fs.readdirSync(root)) {
        const match=/^(staged|previous)-([a-f0-9-]{36})$/.exec(name);
        if(!match || !UUID.test(match[2]))continue;
        if((job?.id===match[2] && ['queued','applying'].includes(job.phase)) || (handover?.id===match[2] && handover.pending))continue;
        const target=path.join(root,name),stat=fs.lstatSync(target);
        if(!stat.isDirectory() || stat.isSymbolicLink() || now-stat.mtimeMs<=RECOVERY_TTL)continue;
        if(path.dirname(fs.realpathSync(target))===fs.realpathSync(root))fs.rmSync(target,{recursive:true,force:true});
      }
      const snapshot=path.join(root,'verified-latest.json');
      if(fs.existsSync(snapshot)) {
        const stat=fs.lstatSync(snapshot);
        if(stat.isFile() && !stat.isSymbolicLink() && now-stat.mtimeMs>this.policy().rawRetentionDays*DAY)fs.unlinkSync(snapshot);
      }
    }
    for (const directory of [this.previewRoot, this.jobRoot]) for (const name of fs.readdirSync(directory)) {
      const id = name.replace(/\.json$/, "");
      if (!UUID.test(id)) continue;
      const file = path.join(directory, name), value = readJson(file);
      const expiredPreview = directory === this.previewRoot && (!value || Number(value.expiresAt) < now);
      const expiredJob = directory === this.jobRoot && value?.phase === "completed" && Number(value.completedAt) + RECOVERY_TTL < now;
      if (!expiredPreview && !expiredJob) continue;
      fs.unlinkSync(file);
      if (expiredJob) {
        const trash = this.trashDirectory(id);
        if (fs.existsSync(trash) && path.dirname(path.resolve(trash)) === path.resolve(this.trashRoot)) fs.rmSync(trash, { recursive: true, force: true });
      }
    }
    for (const name of fs.readdirSync(this.trashRoot)) {
      if (!UUID.test(name) || fs.existsSync(path.join(this.jobRoot, `${name}.json`))) continue;
      const target = this.trashDirectory(name);
      const age = now - fs.statSync(target).mtimeMs;
      if (age > RECOVERY_TTL && path.dirname(path.resolve(target)) === path.resolve(this.trashRoot)) fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

module.exports = { DAY, LocalRetention };
