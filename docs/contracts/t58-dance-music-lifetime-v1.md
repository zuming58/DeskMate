# T58 dance music lifetime

Status: `T58_DANCE_MUSIC_LIFETIME_V1_FROZEN`

Software-only amendment to T19/T20; no firmware, HID, choreography, servo limit or completion-evidence changes.

Baseline comparison (T57 / 1e7e8c6): generated dance cue lasts 8 seconds; renderer plays once and releases on ended. Main already awaits the choreography's terminal completion (repeat count, completion counter and logical-center acknowledgement), including legacy fallback, before stopping audio. These different lifetimes produce silence during a longer dance. A stale operation's finally also stopped whichever track happened to be current.

Dance presets and custom choreography send an explicit loop flag; selected local tracks and built-in beats loop until that motion operation ends. Preview, generic music playback and short non-dance cues remain one-shot. No fixed extension timer or guessed action duration. Completion, cancellation, failure/timeout, explicit stop, hardware disable, emergency stop and renderer teardown still stop/release audio. Audio failure does not invent motion success.

Normal completion is request-owned: an old operation cannot stop a newer preview/dance. Explicit global stop remains unconditional. Renderer stop commands and async track load/play results are generation/request guarded; released callbacks cannot restart or report stale playback. Verify synthetic motion promises beyond the clip boundary, fallback lifetime, failure/stop, replacement races and resource cleanup; actual speaker/motion synchronization remains user-present acceptance.
