# T11E-A EasyInput speaker reference audit

## Fixed source

- External tree: `F:\Codex\easyinput-wzm\easy-input-maker`
- Fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- License: PolyForm Noncommercial License 1.0.0
- Notices retained for provenance: Copyright 2026
  深圳物启万相人工智能有限公司; original author CY-CHENYUE; EasyInput Maker
  is a WaytoAGI community project.

The external tree was read with `git show <commit>:<path>` only. Its dirty
working tree, build output, audio assets and binaries were not copied.

## Behavioral comparison

| Behavior | Fixed Maker reference | DeskMate T11E-A |
| --- | --- | --- |
| Speaker bus | I2S1, GPIO14/13/15 | Same verified board mapping |
| PCM clock | 48 kHz, 16-bit mono left, Philips | Same hardware-valid format |
| DMA safety | 4 descriptors, one zero preload, six-frame normal drain | Clean reimplementation of the same bounds |
| Shared power | GPIO8 unique controller with Speaker lease | Reuses existing DeskMate controller and lease; no new writer |
| Arbitration | Microphone cancels speaker and waits for exact release | Clean minimal generation-based arbiter; deep sleep excluded |
| Audio producer | Local EIAD diagnostic and resource banks | Synthesized low-volume startup probe only |
| Resource sync | Authenticated stop-and-wait A/B bank update | Explicitly not implemented |
| Real-time downlink | Not present | Explicitly not guessed |

## Product implementation

DeskMate adds its own small playback core, I2S service, diagnostics and Host
tests. No Maker source file, `.eiad` asset, sound bank, model, recording or
binary enters this repository. The reference is used to fix hardware facts,
bounded timing and failure vectors, not to claim protocol compatibility that
does not exist.

