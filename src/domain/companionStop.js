const STOP_TIMEOUT_MS = 5000;
const STATUS_TIMEOUT_MS = 1500;

function safeReason(value, fallback = "companion-stop-failed") {
  const reason = String(value || "");
  return /^[a-z0-9-]{1,120}$/.test(reason) ? reason : fallback;
}

function bounded(operation, timeoutMs, timeoutReason, setTimer = setTimeout, clearTimer = clearTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      resolve(value);
    };
    const timer = setTimer(() => finish({ ok: false, reason: timeoutReason, timedOut: true }), timeoutMs);
    Promise.resolve().then(operation).then(
      (value) => finish({ ok: true, value }),
      (error) => finish({ ok: false, reason: safeReason(error?.message) }),
    );
  });
}

export function createCompanionStopAction({ getBridge = () => globalThis.desktopBridge, updateCompanion = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, stopTimeoutMs = STOP_TIMEOUT_MS, statusTimeoutMs = STATUS_TIMEOUT_MS } = {}) {
  let inFlight = null;
  let attempts = 0;
  const reconcile = async (fallbackReason) => {
    const bridge = getBridge();
    const refreshed = await bounded(() => bridge?.getCompanionConversationStatus?.(), statusTimeoutMs, "companion-stop-status-timeout", setTimer, clearTimer);
    const status = refreshed.ok && refreshed.value && typeof refreshed.value === "object" ? refreshed.value : null;
    if (status) updateCompanion(status);
    if (status && !status.active) {
      updateCompanion({ type: "stop.lifecycle", stopLifecycle: { pending: false, result: "reconciled-idle", error: "", attempts } });
      return { ok: true, reconciled: true, status };
    }
    const reason = safeReason(refreshed.ok ? fallbackReason : refreshed.reason, "companion-stop-unconfirmed");
    updateCompanion({ type: "stop.lifecycle", stopLifecycle: { pending: false, result: "failed", error: reason, attempts } });
    return { ok: false, reason, status };
  };

  const stop = (source = "page") => {
    if (inFlight) return inFlight;
    attempts += 1;
    updateCompanion({ type: "stop.lifecycle", stopLifecycle: { pending: true, result: "pending", error: "", source: ["page", "capsule", "escape"].includes(source) ? source : "page", attempts } });
    inFlight = (async () => {
      const bridge = getBridge();
      if (!bridge?.stopCompanionConversation) return reconcile("desktop-bridge-unavailable");
      const stopped = await bounded(() => bridge.stopCompanionConversation(), stopTimeoutMs, "companion-stop-timeout", setTimer, clearTimer);
      if (stopped.ok && stopped.value?.status) updateCompanion(stopped.value.status);
      if (stopped.ok && stopped.value?.status?.active === false) {
        updateCompanion({ type: "stop.lifecycle", stopLifecycle: { pending: false, result: "completed", error: "", attempts } });
        return { ...stopped.value, ok: true, reconciled: !stopped.value?.ok };
      }
      return reconcile(stopped.ok ? stopped.value?.reason : stopped.reason);
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
  return Object.freeze({ stop });
}

export { STATUS_TIMEOUT_MS, STOP_TIMEOUT_MS };
