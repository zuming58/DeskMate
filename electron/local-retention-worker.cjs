const { parentPort, workerData } = require("node:worker_threads");
const { LocalRetention } = require("./local-retention.cjs");
const retention = new LocalRetention({ userDataPath: workerData.userDataPath });
parentPort.on("message", ({ id, command, value }) => {
  try {
    const result = command === "status" ? retention.status()
      : command === "preview" ? retention.preview()
      : command === "confirm" ? retention.confirm(value)
      : command === "tick" ? retention.tick()
      : command === "acknowledge" ? retention.acknowledge(value)
      : command === "deactivate" ? retention.deactivate()
      : (() => { throw new Error("retention-command-invalid"); })();
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: /^retention-[a-z-]+$/.test(String(error?.message || "")) ? error.message : ["ENOSPC", "EDQUOT"].includes(error?.code) ? "retention-disk-full" : "retention-storage-unavailable" });
  }
});
