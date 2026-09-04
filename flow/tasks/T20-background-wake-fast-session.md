# T20 background wake and fast foreground session

## Goal

Make local wake the quiet idle entry and keep the visible realtime conversation short: four-second utterance endpointing, ten-second listening-only idle exit, hidden background wake and immediate capsule display only after a real wake or manual start.

## Acceptance

- Enabled local wake listens while idle without showing the capsule.
- “小智，小智” starts the existing Doubao companion session and then pauses the wake listener.
- A completed utterance uses a 4-second silence window; 10 seconds of listening with no new speech stops the foreground session, hides the capsule and resumes wake.
- Repeated recognition callbacks are debounced.
- Attention, nod and search have short built-in cues; dance has a built-in electronic beat and may be overridden by the user-selected local song.
- The exact user machine preference is enabled only after the user explicitly requests it.

## Out of scope

- Cloud wake, open-dictation background transcription or saving wake audio.
- Streaming-service playback control, generated singing or board-speaker output.
- Any firmware or hardware change.
