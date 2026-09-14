export const VOCABULARY_LIMIT = 2000;
export const IMPORT_LIMIT_BYTES = 2 * 1024 * 1024;

export function stableVocabulary(value) {
  const ids = new Set();
  return {
    hotwords: [...new Set(value.hotwords || [])],
    rules: (value.rules || []).map((rule, index) => {
      let id = typeof rule.id === "string" && rule.id ? rule.id : `legacy-rule-${index}`;
      while (ids.has(id)) id += "-duplicate";
      ids.add(id);
      return { id, from: rule.from, to: rule.to };
    }),
  };
}

export function validateVocabulary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("词库必须是 JSON 对象");
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error("不支持的词库版本");
  if (!Array.isArray(value.hotwords) || !Array.isArray(value.rules)) throw new Error("词库需包含 hotwords 和 rules 数组");
  if (value.hotwords.length > VOCABULARY_LIMIT || value.rules.length > VOCABULARY_LIMIT) throw new Error("词库条目过多（每类最多 2000 条）");
  if (value.hotwords.some((word) => typeof word !== "string" || !word.trim() || word.length > 200)) throw new Error("热词须为 1–200 字符的文字");
  if (value.rules.some((rule) => !rule || typeof rule.from !== "string" || !rule.from.trim() || rule.from.length > 500 || typeof rule.to !== "string" || rule.to.length > 500)) throw new Error("替换规则格式无效：左侧不能为空，每侧最多 500 字符");
  return stableVocabulary({ hotwords: value.hotwords.map((word) => word.trim()), rules: value.rules.map(({ from, to }) => ({ from, to })) });
}

export function mergeVocabulary(current, incoming) {
  const rules = [...current.rules];
  const keys = new Set(rules.map(({ from, to }) => JSON.stringify([from, to])));
  for (const rule of incoming.rules) {
    const key = JSON.stringify([rule.from, rule.to]);
    if (!keys.has(key)) { rules.push({ from: rule.from, to: rule.to }); keys.add(key); }
  }
  const hotwords = [...new Set([...current.hotwords, ...incoming.hotwords])];
  if (hotwords.length > VOCABULARY_LIMIT || rules.length > VOCABULARY_LIMIT) throw new Error("合并后词库超过 2000 条上限");
  return stableVocabulary({ hotwords, rules });
}

export function serializeHistory(items) {
  return JSON.stringify({ schemaVersion: 1, kind: "deskmate-history", records: items.map(({ text, rawText, time, date, duration, count }) => ({ text, rawText, time, date, duration, count })) }, null, 2);
}

export function downloadJson(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
}
