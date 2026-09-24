// Pure packaged-module probe; no product main, IPC, hardware, profile or cloud.
const assert = require('node:assert/strict');
const { load } = require('./verify-t53-natural-package.cjs');
async function verify() {
  const { CodexTaskBriefStore } = load('electron/codex-task-brief.cjs');
  const { mapCodexHookEvent } = load('electron/codex-hook-state.cjs');
  const store = new CodexTaskBriefStore();
  const identity = { taskKey: 'codex_synthetic_task_01', taskLabel: 'Synthetic' };
  for (let i = 0; i < 20; i++) {
    for (const hook_event_name of ['PreToolUse', 'PermissionRequest', 'PostToolUse']) {
      const result = store.ingestHook(mapCodexHookEvent({hook_event_name, tool_name: 'exec_command', ...identity}));
      assert.equal(result.announcement, null);
      assert.equal(result.task.state, 'working');
    }
  }
  const candidate = store.ingestHook(mapCodexHookEvent({hook_event_name: 'PreToolUse', tool_name: 'request_user_input', ...identity})).announcement;
  assert(candidate);
  assert(store.isAnnouncementCurrent(candidate));
  store.ingestHook(mapCodexHookEvent({hook_event_name: 'PostToolUse', tool_name: 'request_user_input', ...identity}));
  assert.equal(store.isAnnouncementCurrent(candidate), false);
  const { CompanionConversationController } = load('electron/companion-conversation.cjs');
  const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = load('electron/companion-audio.cjs');
  let current = true, spoken = 0;
  const controller = new CompanionConversationController({
    providerLabel: 'three-stage', audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(),
    providerFactory: () => ({connect: async () => {current = false; return {ok: true};}, sayHello: () => {spoken++; return true;}, close(){}}),
  });
  const result = await controller.start({initialAnnouncement: 'Synthetic', closeAfterAnnouncement: true, announcementIsCurrent: () => current});
  assert.equal(result.reason, 'companion-announcement-stale');
  assert.equal(spoken, 0);
  assert.equal(controller.snapshot().active, false);
  console.log('T69 final-ASAR permission silence, explicit question, stale cancellation and speech-setup guard passed. No API or hardware invoked.');
}
verify().catch(error => {console.error(error); process.exitCode = 1;});
