const MAX_HOTWORDS = 100;
const MAX_RULES = 100;

const TECHNICAL_ALIASES = Object.freeze({
  codex: [/(?:code\s*[xs]|codex)/giu, /(?:扣|寇|口)(?:得|德|代)克斯/gu],
  deskmate: [/(?:desk\s*mate|deskmate)/giu, /桌面\s*mate/giu],
  "claude code": [/(?:claude\s*code|cloud\s*code)/giu, /克劳德\s*(?:code|扣得)/giu],
  hermes: [/(?:hermes|hermes code)/giu],
});

const DIGIT_ALIASES = Object.freeze({
  0: "(?:0|zero|oh)",
  1: "(?:1|one)",
  2: "(?:2|two|to|too)",
  3: "(?:3|three)",
  4: "(?:4|four|for)",
  5: "(?:5|five)",
  6: "(?:6|six)",
  7: "(?:7|seven)",
  8: "(?:8|eight)",
  9: "(?:9|nine)",
});

const FLEXIBLE_ASCII_SEPARATOR = String.raw`[\s._·•/\\-]*`;
const SPOKEN_HOTWORD_ALIASES = Object.freeze({
  waytoagi: [new RegExp(String.raw`(^|[^A-Za-z0-9])((?:way|wei|v|维|威|微)${FLEXIBLE_ASCII_SEPARATOR}(?:to|two|too|2|图|兔)${FLEXIBLE_ASCII_SEPARATOR}a${FLEXIBLE_ASCII_SEPARATOR}g${FLEXIBLE_ASCII_SEPARATOR}i)(?=$|[^A-Za-z0-9])`, "giu")],
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

function flexibleAsciiPattern(hotword) {
  const compact = hotword.replace(/[^A-Za-z0-9]/g, "");
  if (compact.length < 3) return null;
  const sequence = [...compact].map((character) => DIGIT_ALIASES[character] || character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(FLEXIBLE_ASCII_SEPARATOR);
  return new RegExp(`(^|[^A-Za-z0-9])(${sequence})(?=$|[^A-Za-z0-9])`, "giu");
}

function applyBoundedAlias(text, pattern, canonical) {
  return text.replace(pattern, (_matched, prefix = "") => `${prefix}${canonical}`);
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
    const key = hotword.toLocaleLowerCase("en-US");
    for (const alias of TECHNICAL_ALIASES[key] || []) {
      const next = normalized.replace(alias, hotword);
      if (next !== normalized) matched.push(`hotword:${key}`);
      normalized = next;
    }
    for (const alias of SPOKEN_HOTWORD_ALIASES[key] || []) {
      const next = applyBoundedAlias(normalized, alias, hotword);
      if (next !== normalized) matched.push(`hotword:${key}`);
      normalized = next;
    }
    const flexible = flexibleAsciiPattern(hotword);
    if (flexible) {
      const next = applyBoundedAlias(normalized, flexible, hotword);
      if (next !== normalized) matched.push(`hotword:${key}`);
      normalized = next;
    }
  }
  return Object.freeze({ normalized, changed: normalized !== source, matched: Object.freeze([...new Set(matched)]) });
}

module.exports = { MAX_HOTWORDS, MAX_RULES, normalizeHotwords, normalizeRules, normalizeTranscript };
