# T11A EasyInput audio reference audit

## Fixed inputs

- T10E frozen contract/implementation commit: `9134931b0c1504c02452d20c0c6483f267dff85d`
- T11 software base: `c7d789e7359c744a2059680db4061a3d2a5dc9ff`
- External Maker reference: `F:\Codex\easyinput-wzm\easy-input-maker`
- Maker fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- Maker license: PolyForm Noncommercial 1.0.0

The external reference was read only through its pinned commit. No reference source or binary was copied into the product repository.

## Retained behavior

- Exact `EIHB/EICC/EICA/EIAU` layout and PCM S16LE 16 kHz mono 20 ms framing.
- Explicit configured host, bounded lease, exact validation, source restriction and no replay.
- Bounded in-memory receive queue with drop counting.

## Product-side differences

- Windows uses a user-selected local IPv4 adapter represented to React by an opaque ID and category label, never an IP.
- Credentials are written through the existing T05 transactional configuration path from a separate sandboxed window.
- The microphone test calculates only an RMS-derived level and never starts the Doubao conversation.
- Speaker playback remains explicitly unavailable; computer audio is not substituted.
