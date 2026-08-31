function encodePcm16Wav(chunks, { sampleRate = 16000, channels = 1 } = {}) {
  const audio = Buffer.concat((chunks || []).map((chunk) => Buffer.from(chunk || [])));
  if (audio.length % 2 !== 0) throw new Error("easyinput-recording-audio-invalid");
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + audio.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

module.exports = { encodePcm16Wav };
