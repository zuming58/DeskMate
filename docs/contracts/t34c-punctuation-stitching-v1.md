# T34C dictation punctuation stitching contract v1

Status: `FROZEN`

## Problem boundary

Realtime ASR may finish one recording as several finalized segments. DeskMate must not blindly insert a Chinese comma between every segment because the provider may already put punctuation at either side of that boundary. The live capsule preview and the final inserted text must use the same stitching result.

## Accepted behavior

- Trim whitespace only at segment edges; do not rewrite text inside a segment.
- If neither side of a segment boundary has punctuation, insert one Chinese comma.
- If either side already has punctuation, do not add another mark.
- If both sides have punctuation, collapse only that boundary run to one mark. Prefer a sentence-ending mark over a comma-like mark, otherwise keep the left-side mark.
- Raw dictation continues to preserve fillers, repetitions and provider wording. Punctuation stitching is not semantic cleanup.
- Ignore empty segments while retaining first-seen finalized segment order.
- `session.finished` is still the only successful seal for the whole recording. The main-process realtime session supplies the stitched final text; missing stitched text with non-empty finalized segments triggers full-recording fallback and never returns a partial prefix.

## Safety and privacy

- Diagnostics may expose only bounded timing, segment count and allowlisted reason codes; no transcript or audio.
- This change does not alter microphone capture, VAD, organizer mode, target-window delivery, cloud credentials or hardware behavior.
