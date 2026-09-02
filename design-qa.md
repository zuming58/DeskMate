# Recording Overlay Design QA

- References:
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-b33b01dc-66f9-4150-93f8-d4ec13c003f5.png`
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-3a01b8e0-3cd2-40ca-8557-cc4f737bcb79.png`
- Implemented capture: `qa/overlay-component.png`
- Viewport/state: Windows desktop recording overlay, active recording, long live transcript present.

## Comparison

| Requirement | Result |
| --- | --- |
| Center the overlay above the bottom work area | Passed — the focusless window is horizontally centered. |
| Reduce the visual footprint | Passed — 46 px content height inside a 58 px transparent window. |
| Keep the recording view to one line | Passed — waveform, rolling transcript, timer, and cancel hint share one row. |
| Remove the redundant recording title | Passed — recording state is communicated by the pulsing dot and waveform. |
| Show the latest recognized speech | Passed — long transcripts are tail-windowed to the newest 24 characters instead of preserving the beginning. |
| Make the overlay appear without waiting for background work | Passed — the key event reaches the recorder before either the foreground-window PowerShell query or realtime WebSocket handshake finishes; early PCM is buffered and flushed after connection. |
| Preserve timer and cancellation guidance | Passed — timer remains right-aligned and `Esc 取消` stays visible. |
| Avoid stealing focus from the target input | Passed — the overlay remains focusless and ignores mouse input. |

## Remaining validation

- Physical-board verification is required for perceived F22-to-overlay latency and continuous transcript tail movement.

final result: passed
