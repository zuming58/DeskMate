const { createHash } = require("crypto");

const MODEL = "deskmate-local-hash-embedding-v1";
const DIMENSIONS = 256;

function tokens(value) {
  const text = String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const result = [];
  const words = text.match(/[a-z0-9_]+/g) || [];
  result.push(...words);
  const compact = text.replace(/\s+/g, "");
  for (let index = 0; index < compact.length; index += 1) {
    result.push(compact.slice(index, index + 1));
    if (index + 1 < compact.length) result.push(compact.slice(index, index + 2));
    if (index + 2 < compact.length) result.push(compact.slice(index, index + 3));
  }
  return result.slice(0, 12000);
}

function embed(value) {
  const vector = new Float32Array(DIMENSIONS);
  for (const token of tokens(value)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt16LE(0) % DIMENSIONS;
    vector[index] += digest[2] & 1 ? 1 : -1;
  }
  let norm = 0;
  for (const item of vector) norm += item * item;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return vector;
}

function encode(vector) { return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength); }
function decode(value, dimensions = DIMENSIONS) {
  const buffer = Buffer.from(value || []);
  if (buffer.byteLength !== dimensions * 4) throw new Error("memory-embedding-vector-invalid");
  const result = new Float32Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) result[index] = buffer.readFloatLE(index * 4);
  return result;
}
function cosine(left, right) {
  if (left.length !== right.length) return 0;
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return Number.isFinite(score) ? score : 0;
}

module.exports = { MODEL, DIMENSIONS, cosine, decode, embed, encode };
