const DEFAULT_MIN_CHARACTERS = 4;
const DEFAULT_MAX_CHARACTERS = 80;
const MAX_VISIBLE_CHARACTERS = 16 * 1024;

function cleanVisibleText(value, max = MAX_VISIBLE_CHARACTERS) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
}

function comparable(value) {
  return cleanVisibleText(value).replace(/\s+/g, "");
}

class CompanionSpeechSegmenter {
  constructor({ minCharacters = DEFAULT_MIN_CHARACTERS, maxCharacters = DEFAULT_MAX_CHARACTERS } = {}) {
    this.minCharacters = Math.max(1, Math.min(32, Number(minCharacters) || DEFAULT_MIN_CHARACTERS));
    this.maxCharacters = Math.max(this.minCharacters, Math.min(240, Number(maxCharacters) || DEFAULT_MAX_CHARACTERS));
    this.fullText = "";
    this.pending = "";
    this.emitted = "";
    this.finished = false;
  }

  takeReady({ flush = false } = {}) {
    const segments = [];
    while (this.pending) {
      let end = -1;
      const scanLimit = Math.min(this.pending.length, this.maxCharacters);
      for (let index = 0; index < scanLimit; index += 1) {
        if (/[。！？!?；;\n]/.test(this.pending[index]) && index + 1 >= this.minCharacters) {
          end = index + 1;
          break;
        }
      }
      if (end < 0 && this.pending.length >= this.maxCharacters) end = this.maxCharacters;
      if (end < 0 && flush) end = this.pending.length;
      if (end < 0) break;
      const segment = this.pending.slice(0, end).trim();
      this.pending = this.pending.slice(end);
      if (!segment) continue;
      this.emitted += segment;
      segments.push(segment);
    }
    return segments;
  }

  push(delta) {
    if (this.finished) throw new Error("three-stage-segmenter-finished");
    const content = cleanVisibleText(delta);
    if (!content) return [];
    if (this.fullText.length + content.length > MAX_VISIBLE_CHARACTERS) throw new Error("three-stage-response-too-large");
    this.fullText += content;
    this.pending += content;
    return this.takeReady();
  }

  finish(finalText = this.fullText) {
    if (this.finished) throw new Error("three-stage-segmenter-finished");
    this.finished = true;
    const authoritative = cleanVisibleText(finalText);
    if (!authoritative.trim() || comparable(authoritative) !== comparable(this.fullText)) throw new Error("three-stage-stream-invalid");
    const tail = this.takeReady({ flush: true });
    if (comparable(this.emitted) !== comparable(authoritative)) throw new Error("three-stage-stream-invalid");
    return tail;
  }
}

module.exports = {
  CompanionSpeechSegmenter,
  MAX_VISIBLE_CHARACTERS,
  cleanVisibleText,
  comparable,
};
