const { randomUUID } = require("crypto");

const TOKEN_TTL_MS = 60_000;
const MAX_PENDING_TOKENS = 8;

class CompanionMemoryControl {
  constructor({ store, now = () => Date.now(), createToken = randomUUID } = {}) {
    if (!store) throw new Error("memory-store-required");
    this.store = store;
    this.now = now;
    this.createToken = createToken;
    this.pending = new Map();
  }

  prepareForget(value = {}) {
    this.prune();
    const scope = value.scope === "all" ? "all" : "item";
    const target = scope === "all" ? { scope } : { scope, type: value.type, id: value.id };
    let revision;
    try { revision = this.store.mutationRevision(target); }
    catch (error) { return { ok: false, reason: error.message || "memory-forget-invalid" }; }
    if (!revision) return { ok: false, reason: "memory-item-not-found" };
    if (this.pending.size >= MAX_PENDING_TOKENS) this.pending.delete(this.pending.keys().next().value);
    const token = this.createToken();
    const expiresAt = this.now() + TOKEN_TTL_MS;
    this.pending.set(token, { target, revision, expiresAt });
    return { ok: true, token, expiresAt, scope, type: target.type || "all" };
  }

  confirmForget(value = {}) {
    const token = String(value.token || "");
    const pending = this.pending.get(token);
    this.pending.delete(token);
    if (!pending || this.now() > pending.expiresAt) return { ok: false, reason: "memory-confirmation-expired" };
    let revision;
    try { revision = this.store.mutationRevision(pending.target); }
    catch (error) { return { ok: false, reason: error.message || "memory-forget-invalid" }; }
    if (!revision) return { ok: false, reason: "memory-item-not-found" };
    if (revision !== pending.revision) return { ok: false, reason: "memory-changed-concurrently" };
    return pending.target.scope === "all" ? this.store.forgetAll() : this.store.deleteItem(pending.target);
  }

  prune() {
    const now = this.now();
    for (const [token, pending] of this.pending) if (now > pending.expiresAt) this.pending.delete(token);
  }

  clear() { this.pending.clear(); }
}

module.exports = { CompanionMemoryControl, MAX_PENDING_TOKENS, TOKEN_TTL_MS };
