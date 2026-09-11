// Deterministic routing, not a second model call. A local miss is NOT evidence
// that the user never did something; the answer must preserve that distinction.
const DAY_MS = 86400000;

function memoryQueryPlan(value, { now = Date.now() } = {}) {
  const text = String(value || '').normalize('NFKC').trim().slice(0, 1000);
  const explicit = /knowledge\s*os|知识库|知识中枢|查资料|检索资料|查文档|搜索文档|长期记忆|数字画像/i.test(text);
  const noRemote = /(?:不要|不用|别|无需).{0,8}(?:检索|搜索|查询|查|访问)|只(?:用|看|查)(?:本地|当前)/.test(text);
  const current = /刚才|刚刚|这段|接着|继续|上一句|上一个问题/.test(text);
  const historical = explicit || /记得|记忆|以前|之前|历史|过去|曾经|当时|上次|昨天|前天|前几天|这几天|前阵子|最近|上周|上个月|上月|去年|前年|年前|个月前|天前|周前|我的.{0,5}(?:偏好|喜好|习惯|经历)|我(?:平时|喜欢|偏好)|我.{0,10}(?:做过|聊过|提过|去过|说过)|我们.{0,10}(?:决定|讨论过)|今天.{0,12}(?:做了|干了|忙了|完成了|聊了|工作总结)/.test(text) || /\d{4}[-年/]\d{1,2}/.test(text);
  let since = null, until = null;
  const date = text.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?/);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (date) {
    const start = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
    if (start.getFullYear() === Number(date[1]) && start.getMonth() === Number(date[2]) - 1 && start.getDate() === Number(date[3])) {
      since = start.getTime(); const end = new Date(start); end.setDate(end.getDate() + 1); until = end.getTime();
    }
  } else if (/昨天|前天/.test(text)) {
    const start = new Date(today); start.setDate(start.getDate() - (/前天/.test(text) ? 2 : 1));
    since = start.getTime(); const end = new Date(start); end.setDate(end.getDate() + 1); until = end.getTime();
  } else if (/上个月|上月/.test(text)) {
    since = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
    until = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  }
  const currentOnly = current && !/以前|之前|历史|上次|昨天|前天|上周|上个月|上月|去年|个月前|天前|周前|\d{4}[-年/]/.test(text);
  return { kind: explicit && !noRemote ? 'explicit-knowledge' : currentOnly ? 'current-dialogue' : historical ? 'history' : 'conversation', noRemote, since, until, query: text };
}

function relevantLocalEvidence(query, rows, plan = {}) {
  // Scores here are local hash-vector similarity, not calibrated confidence.
  return (rows || []).some(row => {
    const at = Number(row.createdAt) || new Date(`${row.day || ''}T12:00:00`).getTime();
    if (plan.since !== null && plan.since !== undefined && !(at >= plan.since && at < plan.until)) return false;
    return Number(row.score) >= 0.32;
  });
}

function remoteRetrievalReason(plan, localHit) {
  if (plan.noRemote) return 'user-local-only';
  if (plan.kind === 'explicit-knowledge') return 'explicit-knowledge';
  if (plan.kind === 'history') return localHit ? 'local-hit' : 'history-local-miss';
  return plan.kind;
}

// Reject promptly even if an optional implementation ignores AbortSignal. The
// production MCP client also kills its request process, so no orphan lookup runs.
async function boundedRecall(read, query, { signal, timeoutMs }) {
  if (signal?.aborted) return { rows: [], status: 'cancelled' };
  const controller = new AbortController();
  let timer, onAbort;
  const stopped = new Promise(resolve => {
    onAbort = () => { controller.abort(); resolve({ rows: [], status: 'cancelled' }); };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); resolve({ rows: [], status: 'timeout' }); }, timeoutMs);
  });
  try {
    return await Promise.race([stopped, Promise.resolve().then(() => read(query, { signal: controller.signal })).then(rows => ({ rows: Array.isArray(rows) ? rows : [], status: rows?.length ? 'found' : 'empty' }), () => ({ rows: [], status: 'unavailable' }))]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

module.exports = { DAY_MS, memoryQueryPlan, relevantLocalEvidence, remoteRetrievalReason, boundedRecall };
