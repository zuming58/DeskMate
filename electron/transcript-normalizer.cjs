const MAX_HOTWORDS = 100;
const MAX_RULES = 100;

const TECHNICAL_ALIASES = Object.freeze({
  codex: [/(?:code\s*[xs]|codex)/giu, /(?:扣|寇|口)(?:得|德|代)克斯/gu],
  deskmate: [/(?:desk\s*mate|deskmate)/giu, /桌面\s*mate/giu],
  "claude code": [/(?:claude\s*code|cloud\s*code)/giu, /克劳德\s*(?:code|扣得)/giu],
  hermes: [/(?:hermes|hermes code)/giu],
});

function bounded(value, maxLength = 64) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, maxLength);
}

function normalizeHotwords(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, MAX_HOTWORDS).map((item) => bounded(item)).filter(Boolean))];
}

function normalizeRules(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_RULES).map((item) => ({ from: bounded(item?.from, 200), to: bounded(item?.to, 200) })).filter((item) => item.from);
}

function normalizeTranscript(text, { hotwords = [], rules = [] } = {}) {
  const source = String(text || "").slice(0, 20000);
  let normalized = source;
  const matched = [];
  for (const rule of normalizeRules(rules)) {
    if (!normalized.includes(rule.from)) continue;
    normalized = normalized.split(rule.from).join(rule.to);
    matched.push("replacement-rule");
  }
  for (const hotword of normalizeHotwords(hotwords)) {
    const aliases = TECHNICAL_ALIASES[hotword.toLocaleLowerCase("en-US")];
    if (!aliases) continue;
    for (const alias of aliases) {
      const next = normalized.replace(alias, hotword);
      if (next !== normalized) matched.push(`hotword:${hotword.toLocaleLowerCase("en-US")}`);
      normalized = next;
    }
  }
  return Object.freeze({ normalized, changed: normalized !== source, matched: Object.freeze([...new Set(matched)]) });
}

module.exports = { MAX_HOTWORDS, MAX_RULES, normalizeHotwords, normalizeRules, normalizeTranscript };
