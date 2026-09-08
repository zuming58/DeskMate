// Main-process short-term context. Audio/provider lifetimes do not own memory.
const MAX_CONTEXT_MESSAGES = 80;
const MAX_CONTEXT_CHARACTERS = 32000;
const CONTEXT_AGE_MS = 24 * 60 * 60 * 1000;
const INTERRUPTED_NOTE = "（这段回答被打断，文字可能尚未全部播出；可以据此继续话题，不要假定用户已听完整段。）";

class CompanionDialogueContext {
  constructor({ now = Date.now, seed = [] } = {}) {
    this.now = now;
    this.entries = [];
    this.lastRequest = { messages: 0, reviewedMemories: 0 };
    for (const row of seed) this.append(row.role, row.content, Number(row.createdAt));
  }

  prune() {
    const cutoff = this.now() - CONTEXT_AGE_MS;
    this.entries = this.entries.filter((entry) => entry.at >= cutoff && entry.at <= this.now());
    let characters = this.entries.reduce((sum, entry) => sum + entry.content.length, 0);
    while (this.entries.length > MAX_CONTEXT_MESSAGES || characters > MAX_CONTEXT_CHARACTERS) characters -= this.entries.shift().content.length;
    while (this.entries[0]?.role === "assistant") this.entries.shift();
  }

  append(role, content, at = this.now()) {
    if (!["user", "assistant"].includes(role)) return null;
    const entry = { role, content: String(content || "").trim().slice(0, 8000), at: Number.isFinite(at) ? at : this.now(), sealed: false, interrupted: false };
    this.entries.push(entry);
    this.prune();
    return entry;
  }

  begin(text) {
    this.append("user", text);
    return this.append("assistant", "");
  }

  update(entry, text, { finished = false, interrupted = false } = {}) {
    if (!entry || entry.sealed || !this.entries.includes(entry)) return;
    entry.content = String(text || "").trim().slice(0, 8000);
    entry.interrupted = interrupted;
    entry.sealed = finished || interrupted;
    this.prune();
  }

  markInterrupted(entry) {
    if (entry && this.entries.includes(entry)) { entry.interrupted = true; entry.sealed = true; }
  }

  messages() {
    this.prune();
    return this.entries.filter((entry) => entry.content).map((entry) => ({ role: entry.role, content: entry.content + (entry.interrupted ? INTERRUPTED_NOTE : "") }));
  }

  recordRequest(messages, reviewedMemories) { this.lastRequest = { messages, reviewedMemories }; }
  earliestTimestamp() { this.prune(); return this.entries[0]?.at || this.now() + 1; }
  status() { return { version: 1, retainedMessages: this.messages().length, appliedMessages: this.lastRequest.messages, appliedReviewedMemories: this.lastRequest.reviewedMemories }; }
  clear() { this.entries = []; this.lastRequest = { messages: 0, reviewedMemories: 0 }; }
}

module.exports = { CompanionDialogueContext, MAX_CONTEXT_MESSAGES, MAX_CONTEXT_CHARACTERS, CONTEXT_AGE_MS, INTERRUPTED_NOTE };
