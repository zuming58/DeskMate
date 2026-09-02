"use strict";

const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const UINT32_MAX = 0xffffffff;
const DEFAULT_BLOCK_SIZE = 4096;
const DEFAULT_INITIAL_FLOOR = 0x40000000;
const DEFAULT_RECOVERY_FLOORS = Object.freeze([0x80000000, 0xc0000000, 0xe0000000, 0xf0000000, 0xff000000, 0xfff00000, 0xffff0000]);

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function checksum(reservedThrough) {
  return createHash("sha256").update(`manual-calibration-request-id-v1:${reservedThrough}`).digest("hex");
}

function validateRecord(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || !Number.isInteger(value.reservedThrough) || value.reservedThrough < 1 || value.reservedThrough > UINT32_MAX) return null;
  if (typeof value.checksum !== "string" || value.checksum !== checksum(value.reservedThrough)) return null;
  return value.reservedThrough;
}

class ManualCalibrationRequestIdStore {
  constructor({ userDataPath, fsImpl = fs, blockSize = DEFAULT_BLOCK_SIZE, initialFloor = DEFAULT_INITIAL_FLOOR, recoveryFloors = DEFAULT_RECOVERY_FLOORS, processId = process.pid, now = () => Date.now() } = {}) {
    if (typeof userDataPath !== "string" || !userDataPath) throw new Error("manual-calibration-request-id-path-required");
    if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > 0x100000) throw new Error("manual-calibration-request-id-block-invalid");
    if (!Number.isInteger(initialFloor) || initialFloor < 1 || initialFloor > UINT32_MAX) throw new Error("manual-calibration-request-id-floor-invalid");
    if (!Array.isArray(recoveryFloors) || recoveryFloors.some((value, index) => !Number.isInteger(value) || value < 1 || value > UINT32_MAX || (index > 0 && value <= recoveryFloors[index - 1]))) throw new Error("manual-calibration-request-id-recovery-invalid");
    this.fs = fsImpl;
    this.blockSize = blockSize;
    this.initialFloor = initialFloor;
    this.recoveryFloors = [...recoveryFloors];
    this.processId = processId;
    this.now = now;
    this.primaryPath = path.join(userDataPath, "manual-calibration-request-ids.json");
    this.backupPath = path.join(userDataPath, "manual-calibration-request-ids.backup.json");
    this.loaded = false;
    this.current = 0;
    this.reservedThrough = 0;
  }

  next() {
    this._load();
    if (this.current >= this.reservedThrough) this._reserveFrom(this.current + 1);
    if (this.current >= UINT32_MAX) throw errorWithCode("manual-calibration-request-id-exhausted");
    this.current += 1;
    return this.current;
  }

  recoverAfterStale(staleRequestId) {
    this._load();
    if (!Number.isInteger(staleRequestId) || staleRequestId < 1 || staleRequestId > UINT32_MAX) throw errorWithCode("manual-calibration-request-id-invalid");
    const lowerBound = Math.max(staleRequestId, this.current, this.reservedThrough);
    const floor = this.recoveryFloors.find((value) => value > lowerBound && value <= UINT32_MAX - this.blockSize + 1);
    if (!floor) throw errorWithCode("manual-calibration-request-id-exhausted");
    this.current = floor - 1;
    this.reservedThrough = floor - 1;
    this._reserveFrom(floor);
    return true;
  }

  _load() {
    if (this.loaded) return;
    const candidates = [this.primaryPath, this.backupPath].map((filePath) => this._read(filePath));
    const existing = candidates.filter((candidate) => candidate.exists);
    const valid = existing.map((candidate) => candidate.value).filter(Number.isInteger);
    if (existing.length > 0 && valid.length === 0) throw errorWithCode("manual-calibration-request-id-store-corrupt");
    const highWater = valid.length > 0 ? Math.max(...valid) : this.initialFloor - 1;
    this.current = highWater;
    this.reservedThrough = highWater;
    this.loaded = true;
  }

  _read(filePath) {
    try {
      if (!this.fs.existsSync(filePath)) return { exists: false, value: null };
      const parsed = JSON.parse(this.fs.readFileSync(filePath, "utf8"));
      return { exists: true, value: validateRecord(parsed) };
    } catch {
      return { exists: true, value: null };
    }
  }

  _reserveFrom(start) {
    if (!Number.isInteger(start) || start < 1 || start > UINT32_MAX) throw errorWithCode("manual-calibration-request-id-exhausted");
    const reservedThrough = Math.min(UINT32_MAX, start + this.blockSize - 1);
    const record = Object.freeze({ version: 1, reservedThrough, checksum: checksum(reservedThrough) });
    try {
      this.fs.mkdirSync(path.dirname(this.primaryPath), { recursive: true });
      this._writeAtomic(this.backupPath, record);
      this._writeAtomic(this.primaryPath, record);
    } catch {
      throw errorWithCode("manual-calibration-request-id-persist-failed");
    }
    this.reservedThrough = reservedThrough;
  }

  _writeAtomic(filePath, record) {
    const temporary = `${filePath}.${this.processId}.${this.now()}.tmp`;
    this.fs.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    this.fs.renameSync(temporary, filePath);
  }
}

module.exports = {
  DEFAULT_BLOCK_SIZE,
  DEFAULT_INITIAL_FLOOR,
  DEFAULT_RECOVERY_FLOORS,
  ManualCalibrationRequestIdStore,
  UINT32_MAX,
};
