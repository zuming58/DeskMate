const { crc16Ccitt } = require("./easyinput-config.cjs");

const STYLE_STUDIO_LEASE_REPORT_ID = 0x1c;
const STYLE_STUDIO_LEASE_TTL_MS = 2500;
const STYLE_STUDIO_ENCODER_ACTION_ID = "4c82a3a0-ff30-49a8-a76f-1bb3dcdbcd01";

function encodeStyleStudioLeaseReport({ operation, token, ttlMs = STYLE_STUDIO_LEASE_TTL_MS } = {}) {
  const operationCode = operation === "acquire" || operation === "renew" ? 1 : operation === "release" ? 2 : 0;
  if (!operationCode) throw new Error("style-studio-lease-operation-invalid");
  if (!Number.isInteger(token) || token < 1 || token > 0xffffffff) throw new Error("style-studio-lease-token-invalid");
  const ttl = operationCode === 2 ? 0 : ttlMs;
  if (!Number.isInteger(ttl) || (operationCode === 1 && (ttl < 1000 || ttl > 5000))) throw new Error("style-studio-lease-ttl-invalid");

  const report = Buffer.alloc(64);
  report[0] = STYLE_STUDIO_LEASE_REPORT_ID;
  report.write("DMSL", 1, "ascii");
  report[5] = 1;
  report[6] = operationCode;
  report[7] = 1;
  report[8] = 0;
  report.writeUInt32LE(token >>> 0, 9);
  report.writeUInt32LE(ttl >>> 0, 13);
  report.writeUInt16LE(crc16Ccitt(report.subarray(1, 17)), 17);
  return report;
}

function decodeStyleStudioLeaseReport(value) {
  const report = Buffer.from(value || []);
  if (report.length !== 64 || report[0] !== STYLE_STUDIO_LEASE_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMSL" || report[5] !== 1 || ![1, 2].includes(report[6]) || report[7] !== 1 || report[8] !== 0 || report.subarray(19).some(Boolean) || report.readUInt16LE(17) !== crc16Ccitt(report.subarray(1, 17))) throw new Error("style-studio-lease-report-invalid");
  const token = report.readUInt32LE(9);
  const ttlMs = report.readUInt32LE(13);
  if (!token || (report[6] === 1 ? ttlMs < 1000 || ttlMs > 5000 : ttlMs !== 0)) throw new Error("style-studio-lease-report-invalid");
  return { operation: report[6] === 1 ? "acquire" : "release", token, ttlMs };
}

module.exports = {
  STYLE_STUDIO_LEASE_REPORT_ID,
  STYLE_STUDIO_LEASE_TTL_MS,
  STYLE_STUDIO_ENCODER_ACTION_ID,
  encodeStyleStudioLeaseReport,
  decodeStyleStudioLeaseReport,
};
