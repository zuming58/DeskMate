const CONFIG_REPORT_ID = 0x10;
const CONFIG_MAX_JSON_BYTES = 2048;
const CONFIG_CHUNK_BYTES = 52;
const CONFIG_READ_REPORT_ID = 0x13;
const CONFIG_READ_CHUNK_BYTES = 49;

function crc16Ccitt(buffer) {
  let crc = 0xffff;
  for (const value of buffer) {
    crc ^= value << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function encodeKeyboardConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema !== "ai_keyboard.v1") throw new Error("键盘配置格式无效");
  const json = JSON.stringify(value);
  const data = Buffer.from(json, "utf8");
  if (!data.length || data.length > CONFIG_MAX_JSON_BYTES) throw new Error("键盘配置超过 2048 字节限制");
  const crc16 = crc16Ccitt(data);
  const totalChunks = Math.ceil(data.length / CONFIG_CHUNK_BYTES);
  const reports = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = data.subarray(index * CONFIG_CHUNK_BYTES, (index + 1) * CONFIG_CHUNK_BYTES);
    const report = Buffer.alloc(64);
    report[0] = CONFIG_REPORT_ID;
    report[1] = 0x53;
    report[2] = 0x33;
    report[3] = 0x43;
    report[4] = 1;
    report[5] = index;
    report[6] = totalChunks;
    report.writeUInt16LE(data.length, 7);
    report[9] = chunk.length;
    report.writeUInt16LE(crc16, 10);
    chunk.copy(report, 12);
    reports.push(report);
  }
  return { json, bytes: data.length, crc16, reports };
}

function encodeConfigReadRequest(requestId) {
  if (!Number.isInteger(requestId) || requestId <= 0 || requestId > 0xffffffff) throw new Error("配置读取请求 ID 无效");
  const report = Buffer.alloc(64);
  report[0] = CONFIG_READ_REPORT_ID;
  report[1] = 0x53; report[2] = 0x33; report[3] = 0x52; report[4] = 1;
  report.writeUInt32LE(requestId >>> 0, 5);
  report[9] = 0x02;
  return report;
}

function parseConfigSnapshot(value) {
  if (!value || value.type !== "config-snapshot" || typeof value.jsonBase64 !== "string" || value.jsonBase64.length > 4096 || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > CONFIG_MAX_JSON_BYTES || !Number.isInteger(value.crc16) || value.crc16 < 0 || value.crc16 > 0xffff) return null;
  let data;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.jsonBase64)) return null;
  try { data = Buffer.from(value.jsonBase64, "base64"); } catch { return null; }
  if (data.length !== value.bytes || crc16Ccitt(data) !== value.crc16 || value.sourceId < 0 || value.sourceId > 3) return null;
  try { new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { return null; }
  return { bytes: data.length, crc16: value.crc16, source: Number.isInteger(value.sourceId) ? value.sourceId : 0, json: data.toString("utf8"), requestId: value.requestId };
}

function parseAppCommandReport(value) {
  const report = Buffer.from(value || []);
  if (report.length < 5 || report[0] !== 0x11) return null;
  const kind = report[1];
  const chunk = report[2];
  const totalChunks = report[3];
  const length = report[4];
  if (chunk !== 0 || totalChunks !== 1 || length > 59 || 5 + length > report.length) return null;
  if (kind === 0x05 && length === 36) {
    const hostActionId = report.subarray(5, 41).toString("ascii");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(hostActionId) ? { kind: "host-action", hostActionId } : null;
  }
  if (kind === 0x03 && length === 7) {
    return { kind: "config-ack", phase: report[5], ok: report[6] === 1, bytes: report.readUInt16LE(7), crc16: report.readUInt16LE(9), saved: report[11] === 1 };
  }
  return null;
}

module.exports = { CONFIG_REPORT_ID, CONFIG_READ_REPORT_ID, CONFIG_MAX_JSON_BYTES, CONFIG_CHUNK_BYTES, CONFIG_READ_CHUNK_BYTES, crc16Ccitt, encodeKeyboardConfig, encodeConfigReadRequest, parseConfigSnapshot, parseAppCommandReport };
