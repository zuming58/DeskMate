const DEFAULT_RETRY_DELAYS_MS = Object.freeze([0, 150, 350]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function verifyConfigReadback({
  readConfig,
  expectedConfig,
  fingerprint,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  wait = delay,
} = {}) {
  if (typeof readConfig !== "function" || typeof fingerprint !== "function" || !Array.isArray(retryDelaysMs) || retryDelaysMs.length < 1) {
    throw new TypeError("configuration readback verifier is not configured");
  }

  const expectedFingerprint = fingerprint(expectedConfig);
  let readbackReason = "config-readback-failed";
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (attempt > 0) await wait(Math.max(0, Number(retryDelaysMs[attempt]) || 0));
    let readback;
    try { readback = await readConfig(); }
    catch (error) { readback = { ok: false, reason: error?.message || "config-readback-failed" }; }
    if (!readback?.ok) {
      readbackReason = readback?.reason || "config-readback-failed";
      continue;
    }

    let config;
    try { config = JSON.parse(readback.json); }
    catch { return { ok: false, saved: true, reason: "config-readback-invalid", attempts: attempt + 1 }; }
    if (fingerprint(config) !== expectedFingerprint) {
      return { ok: false, saved: true, reason: "config-readback-mismatch", attempts: attempt + 1 };
    }
    return { ok: true, saved: true, config, source: readback.source, fingerprint: expectedFingerprint, attempts: attempt + 1 };
  }

  return { ok: false, saved: true, reason: "config-readback-failed", readbackReason, attempts: retryDelaysMs.length };
}

module.exports = { DEFAULT_RETRY_DELAYS_MS, verifyConfigReadback };
