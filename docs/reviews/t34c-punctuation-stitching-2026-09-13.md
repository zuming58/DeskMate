# T34C dictation punctuation stitching

User reported that raw dictation still contained repeated punctuation such as a period followed by an injected comma. The redacted diagnostic showed nine finalized realtime segments with complete session finalization and successful active-window output.

## Correction

- Added one main-process `stitchRecognizedSegments` implementation for both live capsule preview and the sealed final transcript.
- A Chinese comma is inserted only when neither adjacent segment boundary already has punctuation.
- When both sides provide punctuation, only the boundary run is collapsed. Sentence-ending punctuation wins over comma-like punctuation; otherwise the left mark is kept.
- Segment-edge whitespace and empty segments are ignored. Text inside a segment, fillers, repetitions and provider wording remain unchanged in raw mode.
- `session.finished` supplies the stitched whole-session text to the renderer completion guard. Missing stitched text with non-empty finalized segments fails closed to full-recording fallback instead of recreating the old comma-joined prefix.
- Diagnostics add only the allowlisted `missing-session-text` reason; transcript and audio remain excluded.

## Verification

- Targeted Bailian/T34A/T34C tests: **26/26**.
- Full `npm test`: **670/670**, zero failures/skips. `git diff --check`, native publish, Vite build, Windows directory package and exact packaged-resource verification passed.
- Final ASAR was exercised with stock Electron 36.9.5 in isolated profiles: scene/memory layout, real backup worker/UI and data-safety/retention probes passed. No live profile, microphone, hardware, cloud or firmware was used by automated checks.
- Candidate: `release-t34c/win-unpacked/DeskMate.exe`; build ID `t34c-punctuation-stitching`.
- SHA256: executable `85A9E79CE724EA4B1ABF55455A8070E768BF79DE6D792FB7D70427BA60E0307F`; ASAR `207691F90C6C0E0C5B5F6A0619DB7BAF59590B3AD0B41D932C47B5B46C37BD66`.

## Running adoption

The old T34B tray menu was verified idle by its “开始语音输入” item. It was closed through its own “退出” action and exited normally; no force termination. T34C then started against the existing profile, main PID 28568, responsive visible window. No restore, cleanup activation, credential, keyboard mapping, hardware or firmware operation was performed.

Manual acceptance remains required: make a raw multi-pause dictation and compare both History raw text and the target field. The repeated boundary punctuation should be gone. Filler/repetition cleanup remains the optional slower smart mode; possible provider recognition omissions require recording/history comparison and are not claimed fixed by punctuation stitching.
