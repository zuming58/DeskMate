const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

function networkCode(error, depth = 0) {
  if (!error || depth > 3) return 'unknown';
  if (NETWORK_CODES.has(error.code)) return error.code;
  const cause = networkCode(error.cause, depth + 1);
  if (cause !== 'unknown') return cause;
  for (const item of Array.isArray(error.errors) ? error.errors.slice(0, 5) : []) {
    const code = networkCode(item, depth + 1);
    if (code !== 'unknown') return code;
  }
  return 'unknown';
}

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('three-stage-model-cancelled')); return; }
    const cancel = () => { clearTimeout(timer); reject(new Error('three-stage-model-cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

// Only the pre-response boundary can retry: never consume/replay an SSE body.
// Caller owns the overall deadline, immutable body, context entry and speech gate.
async function fetchModelResponse(fetchImpl, endpoint, options, { maxRetries = 1, wait = waitForRetry, onRetry = () => {}, onAttempt = () => {} } = {}) {
  const limit = maxRetries > 0 ? 1 : 0;
  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) throw new Error('three-stage-model-cancelled');
    onAttempt(attempt + 1);
    let response;
    let failure;
    try { response = await fetchImpl(endpoint, options); }
    catch (error) { failure = error; }
    if (options.signal?.aborted) {
      void response?.body?.cancel?.().catch(() => {});
      throw new Error('three-stage-model-cancelled');
    }
    const retryable = failure || (response?.status >= 500 && response?.status <= 599 && response?.headers?.get?.('x-should-retry') !== 'false' && !response?.headers?.get?.('retry-after'));
    if (!retryable || attempt >= limit) {
      if (failure) {
        const safe = new Error('model-connection-failed');
        safe.networkCode = networkCode(failure);
        throw safe;
      }
      return response;
    }
    void response?.body?.cancel?.().catch(() => {});
    onRetry({ attempt: attempt + 2, failureClass: failure ? 'network' : 'server', networkCode: failure ? networkCode(failure) : 'unknown' });
    await wait(250, options.signal);
  }
}

module.exports = { fetchModelResponse, networkCode, waitForRetry };
