const LINK_STATES = new Set(["disabled", "waiting", "connected", "faulted"]);

class LinkRecoveryGate {
  constructor() {
    this.boardConnected = false;
    this.linkState = "unavailable";
  }

  observe(value = {}) {
    const boardConnected = value.boardConnected === true;
    const linkState = boardConnected && LINK_STATES.has(value.linkDiagnostics?.state)
      ? value.linkDiagnostics.state
      : "unavailable";
    const refresh = boardConnected && !this.boardConnected;
    const recover = linkState === "connected" && this.linkState !== "connected";
    this.boardConnected = boardConnected;
    this.linkState = linkState;
    return Object.freeze({ refresh, recover, boardConnected, linkState });
  }
}

module.exports = { LINK_STATES, LinkRecoveryGate };
