const LINK_STATES = new Set(["disabled", "waiting", "connected", "faulted"]);

class LinkRecoveryGate {
  constructor() {
    this.boardConnected = false;
    this.configCollectionWritable = false;
    this.linkState = "unavailable";
  }

  observe(value = {}) {
    const boardConnected = value.boardConnected === true;
    const configCollectionWritable = boardConnected && value.configCollectionWritable !== false;
    const linkState = configCollectionWritable && LINK_STATES.has(value.linkDiagnostics?.state)
      ? value.linkDiagnostics.state
      : "unavailable";
    const refresh = configCollectionWritable && !this.configCollectionWritable;
    const recover = linkState === "connected" && this.linkState !== "connected";
    this.boardConnected = boardConnected;
    this.configCollectionWritable = configCollectionWritable;
    this.linkState = linkState;
    return Object.freeze({ refresh, recover, boardConnected, linkState });
  }
}

module.exports = { LINK_STATES, LinkRecoveryGate };
