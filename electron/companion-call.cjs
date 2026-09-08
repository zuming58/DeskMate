const COMPANION_CALL_ACTION = Object.freeze({
  id: "f11135b4-7471-47f1-808a-629ae99eb63b",
  kind: "companion-call",
  label: "AI 陪伴呼唤",
});

function wakeGreeting(persona = {}) {
  const owner = String(persona.ownerName || "祖名").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 32);
  return `在呢，${owner}。`;
}

module.exports = { COMPANION_CALL_ACTION, wakeGreeting };
