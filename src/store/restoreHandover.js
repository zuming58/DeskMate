export async function restoreBeforeMount(bridge = globalThis.desktopBridge, storage = globalThis.localStorage) {
  const handover = await bridge?.getRestoreHandover?.();
  if (!handover) return;
  if (!handover.id || handover.config?.schemaVersion !== 15) throw Error('恢复配置无效');
  const marker = `deskmate.restore.${handover.id}`;
  if (!storage.getItem(marker)) {
    if (!storage.getItem(`${marker}.previous`)) storage.setItem(`${marker}.previous`, JSON.stringify({ state: storage.getItem('deskmate.app-state'), pending: storage.getItem('deskmate.history-pending.v1') }));
    storage.setItem('deskmate.app-state', JSON.stringify(handover.config));
    storage.removeItem('deskmate.history-pending.v1');
    storage.removeItem('deskmate.app-state.previous-valid');
    storage.setItem(marker, 'ready');
  }
  const result = await bridge.acknowledgeRestore(handover.id);
  if (!result?.ok) throw Error('恢复交接尚未完成');
  storage.setItem(`${marker}.completed-at`, String(Date.now()));
}
