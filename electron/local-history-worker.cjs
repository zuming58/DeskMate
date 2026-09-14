const { parentPort, workerData } = require("node:worker_threads");
const { LocalHistoryStore } = require("./local-history-store.cjs");
let store;
parentPort.on("message", ({ id, command, value }) => {
  try {
    store ||= new LocalHistoryStore({ userDataPath: workerData.userDataPath });
    let result;
    switch (command) {
      case "status": result = store.status(); break;
      case "list": result = store.list(value); break;
      case "append": result = store.append(value); break;
      case "audio-put": result = store.putAudio(value); break;
      case "audio-get": result = store.readAudio(value); break;
      case "stage": result = store.stage(value); break;
      case "finish": result = store.finish(value); break;
      case "remove": result = store.remove(value); break;
      default: throw new Error("local-history-command-invalid");
    }
    parentPort.postMessage({ id, result });
  } catch (error) {
    const reason = /^local-history-[a-z-]+$/.test(error.message) ? error.message : ["ENOSPC", "EDQUOT"].includes(error.code) ? "local-history-disk-full" : "local-history-storage-unavailable";
    parentPort.postMessage({ id, error: reason });
  }
});
