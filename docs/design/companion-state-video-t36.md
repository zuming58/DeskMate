# T36 — Visibility-bounded companion state videos

## Approved assets and provenance

User supplied four generated home-desk clips on 2026-09-13: 等待, 倾听, 思考, 说话. Each source is H.264, 1112×834 (4:3), 24 fps, about 15.05 seconds, with an AAC audio track. Original source files remain untouched outside the repository. First/middle/last contact sheets were inspected: consistent character, outfit and room; thinking has a side glance, speaking has generic mouth movement, endpoints are close but not pixel-identical. No claim of perfect generated loop continuity or phoneme synchronization.

`scripts/prepare-companion-videos.ps1` creates 960×720 H.264/yuv420p CRF23 faststart video-only derivatives, with no stretching or change to framing, and extracts the neutral idle first frame as poster. Runtime assets are ASCII-named under `public/assets/companion/home-video/`. `manifest.json` records each source filename, source SHA256/size and derivative SHA256/size/duration. Combined video payload 5,255,009 bytes, down from 24,147,005 source bytes. No runtime references to Downloads, user paths, remote services or new generation models. Local media-use ledger is QA-only outside the repository.

## Visual mapping, not a second voice workflow

| Existing signal | Visual |
| --- | --- |
| Inactive, connecting, stopped or error with no speaker playback | idle |
| Active listening / ready to hear the user | listen |
| Active thinking or TTS generating but no playback yet | think |
| Existing computer AudioContext actually running with scheduled PCM | speak |

Listening includes ready-to-listen, not only detected speech. The existing source/ASR still determines when speech begins/ends. Do not drive recording or endpointing from animation. The optional sink observer reports only boolean edges, catches observer errors, stops on interruption/drain/suspend/close, and sends no new IPC. A non-persisted `companionPlayback` runtime slice lets the page immediately select current playback on entry. Temporary announcements use the same actual sink. Unsupported future hardware sinks must add explicit playback evidence before enabling speech motion.

## Switching and lifetime

- Exactly two video elements, muted and without controls or preload while inactive. Load the requested next clip, wait for a decoded frame, then crossfade opacity for 150 ms. Release the previous source after 180 ms. Never block TTS or wait for the full 15-second clip.
- On interruption immediately pause mouth motion and fade it toward the neutral poster while the listening frame prepares. Every request carries a local generation token; late load/play/frame callbacks cannot supersede newer state.
- Near the loop boundary (last 350 ms), prepare another copy and apply the same transition. Native looping remains a fallback; this is a best-effort seam softener, not synthetic interpolation. At most two decoders, only briefly overlapping.
- The player mounts only in the companion overview. Other pages and motion/control tabs unmount it. Document hidden, window blur, out-of-viewport and reduced-motion disable it, cancel transition/watchdog timers and remove both video sources. Returning prepares the latest state, not a backlog. Audio conversation can continue independently.
- A four-second loading watchdog or media error releases sources and exposes a local retry over the poster; retry never restarts voice. Poster failure has a neutral textual fallback.

## Verification and acceptance

Tests: pure mapping; real store registration and no persistence/export; two-decoder transition; interruption and rapid A-B-A; stale callbacks; loop seam; failure/timeout/retry; hidden/dispose cleanup; silent PCM observer end/interrupt/suspend and exception isolation; derivative hashes and bundle equality.

Hidden native Electron probe `scripts/probe-companion-video.cjs` renders the actual app, decodes all four videos, verifies synthetic state / zero-PCM playback through the existing audio engine, pause/release/retry/loop seam and enabled navigation, with 1440×1024 and 1024×768 captures. It denies devices/network and uses an isolated profile: not real microphone, cloud, keyboard, hardware or live dialogue evidence. A first probe exposed a missing store runtime-slice registration; fixed and regression-tested before passing.

Delivery must be the complete `release-t36/win-unpacked/DeskMate.exe` with original preload/profile, build ID `t36-companion-state-video`. Never substitute the hidden QA fixture or its default identity for the user's configured 小岚. Manual acceptance: idle loop, speak→interrupt→listen→think→speak, brief gaps and repeated interruptions, then switch pages/minimize/return while audio continues. Check perceived seams and listening timing using actual speech; user retains the final aesthetic judgment.
