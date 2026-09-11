// A read-only home projection. No prompt bodies, transcripts, credentials or paths.
function createWorkbenchOverview({ memoryStore, policyStore, knowledgeOsSettings, promptStore, serviceStatus, wakeStatus, running = false, now = Date.now() }) {
  const policy = policyStore.snapshot();
  const knowledge = knowledgeOsSettings.status();
  const prompts = promptStore.snapshot();
  const scene = prompts.scenes.find(item => item.id === prompts.activeScene);
  return {
    version: 1, updatedAt: now, memory: memoryStore.dashboardSummary(),
    policy: { hourlyEnabled: policy.hourlyEnabled === true, schedule: policy.schedule, dailyTime: policy.dailyTime, rawRetentionDays: policy.rawRetentionDays, sourcesEnabled: policy.enabledSources.length > 0, running },
    knowledge: { configured: knowledge.configured === true, readEnabled: knowledge.readEnabled === true, syncEnabled: knowledge.syncEnabled === true },
    services: { configured: serviceStatus.configured === true, asr: serviceStatus.stages?.asr?.configured === true, model: serviceStatus.stages?.model?.configured === true, tts: serviceStatus.stages?.tts?.configured === true },
    wake: { available: wakeStatus.available === true, enabled: wakeStatus.enabled === true, desiredEnabled: wakeStatus.desiredEnabled === true, reason: String(wakeStatus.reason || '').slice(0, 80) },
    scene: scene ? { id: scene.id, title: scene.title, description: scene.description, promptCount: promptStore.rows({ scope: 'scene', filter: 'all' }).length,
      bindings: [5, 6, 7].map(key => ({ key, label: String(scene.bindings[key]?.label || '未设置').slice(0, 50) })) } : null,
  };
}
module.exports = { createWorkbenchOverview };
