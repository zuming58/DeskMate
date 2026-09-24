const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Write encrypted credentials beside the destination, then atomically replace it.
// A partial write, disk-full or failed rename must leave the previous file intact.
function writePrivateJson(file, value, io = fs) {
  io.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = io.openSync(temporary, 'wx', 0o600);
    io.writeFileSync(descriptor, JSON.stringify(value), 'utf8');
    io.fsyncSync(descriptor);
    io.closeSync(descriptor); descriptor = undefined;
    io.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
    try { io.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
module.exports = { writePrivateJson };
