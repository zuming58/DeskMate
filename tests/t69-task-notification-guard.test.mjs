import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { createDiagnosticReport } from '../src/services/diagnostics.js';
const require = createRequire(import.meta.url);
const { CodexTaskBriefStore } = require('../electron/codex-task-brief.cjs');
const { mapCodexHookEvent, encodeCodexHookMessage, decodeCodexHookMessage } = require('../electron/codex-hook-state.cjs');
const { CompanionConversationController } = require('../electron/companion-conversation.cjs');
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require('../electron/companion-audio.cjs');
const key = 'codex_synthetic_task_01';
test('T69 diagnostic counters are bounded and cannot expose task content', () => {
  const result = createDiagnosticReport({codexTaskBrief: {notificationCounters: {permissionChecks: 100000000, suppressedRepeats: -1, candidates: 2.9, secret: 'private-text'}, tasks: [{taskKey: 'secret-id'}]}});
  assert.deepEqual(result.codexTaskBrief.notificationCounters, {permissionChecks: 1000000, suppressedRepeats: 0, candidates: 2});
  assert.doesNotMatch(JSON.stringify(result), /private-text|secret-id|secret/);
});
function hook(store, event, toolName = 'exec_command', taskKey = key) {
  return store.ingestHook(mapCodexHookEvent({ hook_event_name: event, tool_name: toolName, taskKey, taskLabel: 'Synthetic project' }));
}
function report(store, state, taskKey = key) {
  return store.ingest({ version: 'codex-task-brief-v1', provider: 'codex', taskKey, taskLabel: 'Synthetic project', state, sequence: (store.tasks.get(taskKey)?.sequence || 0) + 1 });
}
test('T69 repeated permissions in main/child sessions never claim a human reply is needed', () => {
  const store = new CodexTaskBriefStore();
  for (const taskKey of [key, 'codex_synthetic_child_02']) {
    for (let i = 0; i < 10; i++) {
      for (const event of ['PreToolUse', 'PermissionRequest', 'PostToolUse']) {
        const result = hook(store, event, 'exec_command', taskKey);
        assert.equal(result.task.state, 'working');
        assert.equal(result.announcement, null);
      }
    }
  }
  assert.doesNotMatch(store.query('Synthetic project').answer, /等你回复/);
  assert.equal(store.status().notificationCounters.permissionChecks, 20);
});
test('T69 both hook protocol versions and legacy mapped permission reports are safe', () => {
  for (const identity of [{}, {session_id: 'synthetic-session', cwd: 'Synthetic'}]) {
    const result = decodeCodexHookMessage(encodeCodexHookMessage({hook_event_name: 'PermissionRequest', tool_name: 'exec_command', ...identity}));
    assert.equal(result.state, 'working');
  }
  const store = new CodexTaskBriefStore();
  report(store, 'working');
  assert.equal(store.ingestHook({event: 'PermissionRequest', state: 'waiting', taskKey: key, taskLabel: 'Synthetic'}).announcement, null);
});
test('T69 explicit questions survive other sessions working and first observed waiting', () => {
  const store = new CodexTaskBriefStore();
  report(store, 'working');
  const result = hook(store, 'PreToolUse', 'request_user_input', 'codex_synthetic_child_02');
  assert.equal(result.announcement.state, 'waiting');
  assert.equal(store.isAnnouncementCurrent(result.announcement), true);
  hook(store, 'PostToolUse');
  assert.equal(store.isAnnouncementCurrent(result.announcement), true);
  hook(store, 'PostToolUse', 'request_user_input', 'codex_synthetic_child_02');
  assert.equal(store.isAnnouncementCurrent(result.announcement), false);
});
test('T69 no waiting inference for asynchronous questions or internal agent waits', () => {
  const store = new CodexTaskBriefStore();
  for (const tool of ['request_user_input_async', 'wait_agent', 'wait', 'spawn_agent']) {
    assert.equal(hook(store, 'PreToolUse', tool).announcement, null);
  }
});
test('T69 same-task repeated waiting is bounded without suppressing errors/completion or other tasks', () => {
  let now = 0;
  const store = new CodexTaskBriefStore({now: () => now});
  report(store, 'working');
  const first = report(store, 'waiting').announcement;
  assert.ok(first);
  assert.equal(report(store, 'waiting').announcement, null);
  assert.equal(store.isAnnouncementCurrent(first), true);
  store.relabel(key, 'Renamed project');
  assert.equal(store.isAnnouncementCurrent(first), true);
  report(store, 'working');
  assert.equal(report(store, 'waiting').announcement, null);
  assert.equal(store.isAnnouncementCurrent(first), false);
  assert.ok(report(store, 'error').announcement);
  assert.ok(report(store, 'completed').announcement);
  assert.ok(report(store, 'waiting', 'codex_other_task_02').announcement);
  now = 16000;
  assert.ok(report(store, 'waiting').announcement);
  assert.equal(store.status().notificationCounters.suppressedRepeats, 1);
});
test('T69 resume, close, stop and eviction invalidate old announcement tokens', () => {
  for (const event of ['PostToolUse', 'Stop', 'SessionEnd']) {
    const store = new CodexTaskBriefStore();
    const first = report(store, 'waiting').announcement;
    hook(store, event);
    assert.equal(store.isAnnouncementCurrent(first), false);
  }
  const store = new CodexTaskBriefStore({maxTasks: 1, throttleMs: 1000});
  const old = report(store, 'waiting').announcement;
  report(store, 'working', 'codex_other_task_02');
  assert.equal(store.isAnnouncementCurrent(old), false);
  report(store, 'waiting');
  assert.equal(store.isAnnouncementCurrent(old), false);
  assert.doesNotMatch(JSON.stringify(store.status()), /taskKey|revision|codex_synthetic/);
});
function controllerFor({sink = new SimulatedCompanionAudioSink(), connect = async () => ({ok: true}), speak = () => true} = {}) {
  return new CompanionConversationController({providerLabel: 'three-stage', audioSource: new SimulatedCompanionAudioSource(), audioSink: sink, providerFactory: () => ({connect, sayHello: speak, speakText: speak, close(){}})});
}
test('T69 stale standalone announcement during connection never reaches TTS and closes cleanly', async () => {
  let current = true, spoken = 0;
  const controller = controllerFor({connect: async () => {current = false; return {ok: true};}, speak: () => {spoken++; return true;}});
  const result = await controller.start({initialAnnouncement: 'Synthetic notice', closeAfterAnnouncement: true, announcementIsCurrent: () => current});
  assert.equal(result.reason, 'companion-announcement-stale');
  assert.equal(spoken, 0);
  assert.equal(controller.snapshot().active, false);
});
test('T69 stale announcement during volume preparation preserves live listening and restores volume', async () => {
  let current = true, spoken = 0;
  const volumes = [], sink = new SimulatedCompanionAudioSink();
  sink.setVolume = async volume => {volumes.push(volume); current = false; return {ok: true};};
  const controller = controllerFor({sink, speak: () => {spoken++; return true;}});
  await controller.start();
  const result = await controller.announce('Synthetic notice', {volume: 0.2, restoreVolume: 0.8, announcementIsCurrent: () => current});
  assert.equal(result.reason, 'companion-announcement-stale');
  assert.equal(spoken, 0);
  assert.deepEqual(volumes, [0.2, 0.8]);
  assert.equal(controller.snapshot().state, 'listening');
  await controller.stop();
});
test('T69 a current notice still reaches the normal speech path', async () => {
  let spoken = 0;
  const controller = controllerFor({speak: () => {spoken++; return true;}});
  await controller.start();
  assert.equal((await controller.announce('Synthetic notice', {announcementIsCurrent: () => true})).ok, true);
  assert.equal(spoken, 1);
  await controller.stop();
});

test('T69 main cancels a resolved notice in the settling window and forwards the last-moment guard', async () => {
  const source = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const store = new CodexTaskBriefStore();
  let release, enabled = true, dispatches = 0, options;
  const context = vm.createContext({
    isQuitting: false, codexTaskBriefStore: store,
    companionPreferenceStore: {get: () => ({codexBriefAnnouncementsEnabled: enabled})},
    setTimeout: callback => {release = callback;}, normalizeTrustedAnnouncement: text => text,
    sendToMain: (channel, payload) => {assert.equal('taskKey' in payload, false); assert.equal('revision' in payload, false);},
    isVoiceActivityActive: () => false, voiceSessionRecording: false, lastVoiceState: {}, foregroundSessionState: {},
    companionIsActive: () => false, companionStartOptions: {},
    startCompanionConversation: async (_, supplied) => {dispatches++; options = supplied; return {ok: true};},
  });
  vm.runInContext(source.slice(source.indexOf('async function announceCodexTaskBrief('), source.indexOf('function personalReminderSnapshot(')), context);
  const first = report(store, 'waiting').announcement;
  const stale = context.announceCodexTaskBrief(first);
  report(store, 'working'); release();
  assert.equal((await stale).reason, 'codex-task-brief-announcement-stale');
  assert.equal(dispatches, 0);
  const next = report(store, 'waiting', 'codex_other_task_02').announcement;
  const fresh = context.announceCodexTaskBrief(next); release();
  assert.equal((await fresh).ok, true);
  assert.equal(options.announcementIsCurrent(), true);
  enabled = false;
  assert.equal(options.announcementIsCurrent(), false);
});

test('T69 task ingestion precedes awaited device work and cannot reorder permission/resume', async () => {
  const source = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const store = new CodexTaskBriefStore();
  let release;
  const context = vm.createContext({
    codexTaskBriefStore: store, codexTaskCatalog: null,
    handleCodexTaskBriefResult() {}, refreshCodexTaskCatalog: async () => {},
    handleAutomaticAgentHookState: async (_, value) => {if (value.event === 'PreToolUse') await new Promise(resolve => {release = resolve;});},
  });
  vm.runInContext(source.slice(source.indexOf('async function handleCodexHookState('), source.indexOf('function codexTaskBriefStatusSnapshot(')), context);
  const pending = context.handleCodexHookState({event: 'PreToolUse', toolName: 'request_user_input', state: 'waiting', taskKey: key, taskLabel: 'Synthetic'});
  await context.handleCodexHookState({event: 'PostToolUse', state: 'working', taskKey: key, taskLabel: 'Synthetic'});
  release(); await pending;
  assert.equal(store.list()[0].state, 'working');
});
