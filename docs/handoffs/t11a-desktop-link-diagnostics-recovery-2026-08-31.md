# T11A desktop Link diagnostics and recovery handoff

## Scope and baseline

- Branch: `codex/t11a-link-diagnostics-recovery`
- Exact base: `codex/t11a-desktop-microphone-source-selection@59176d021a631740e6f112bd3ecbd16148d1ffcd`
- Scope: Windows desktop software only. No EasyInput or Xiaozhi firmware, device, port, Flash, NVS, OLED, servo or audio hardware operation is included.

## What changed

The desktop now presents three separate facts instead of collapsing them into one connection badge:

1. EasyInput HID connection.
2. EasyInput-to-Xiaozhi DeskMate Link state and bounded counters.
3. The most recent desktop Agent State write result.

The Device Connections page exposes `connected`, `waiting`, `faulted`, `disabled`, or explicit `unavailable`, plus the frozen receive/transmit, timeout, retry, peer-restart and Agent forwarding counters already parsed by the native input bridge. The same enumerated and privacy-safe shape is included in the diagnostic JSON export. Raw status JSON, device paths, addresses, identifiers, network data and user content are not exported.

An acknowledged write is deliberately labelled `EasyInput write ACK`. It proves that the native bridge completed the HID write to EasyInput; it does not by itself prove Xiaozhi rendered the expression. Xiaozhi progress must be corroborated by Link state and forwarding counters.

## Manual send and reconnect recovery

- Clicking any of the seven manual Agent states sends immediately.
- Clicking the already selected state creates a new transition and sends again.
- The latest request shows target state, request/write status, bounded failure reason and timestamp.
- On application start or EasyInput reconnect, the desktop rereads the existing capability/status report.
- When Link rises from unavailable, waiting or faulted to connected, the existing Agent publisher sends the current unexpired intent once. If no current intent remains valid, it sends `idle`.
- Expired listening, completed or error intents are never replayed. No second Agent state machine was introduced.
- Link status reads and the existing EasyInput audio configuration refresh are serialized on reconnect because both use the single native Feature Report read slot.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: 182/182 passed.
- `npm run build:desktop`: passed, including native InputBridge Release publish and Windows Electron packaging.
- `git diff --check`: passed.
- Changed paths are ASCII; firmware scope is unchanged; generated dependencies and build/package output remain ignored.

## Remaining acceptance

No UI automation or hardware action was used. With the user present, open Device Connections and confirm:

1. HID connected with Link absent displays `unavailable`, never `connected`.
2. A healthy two-board path displays `connected` and advancing RX/TX counters.
3. Re-sending the same manual expression creates a new EasyInput write result and advances the appropriate Link/Agent counters.
4. Restarting Xiaozhi causes a visible Link transition and one valid-state recovery (or `idle` when the previous state expired).
5. An unavailable or failed Link never displays `synced` or Xiaozhi acknowledgement.
