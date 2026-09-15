# T58 dance accompaniment lifetime

## Evidence and implementation

User reports music finishes while dance motion continues. T57 source confirms the built-in dance WAV lasts 8000 ms and renderer releases its one-shot audio on natural end. Main already awaits the real choreography completion predicate, including repeat count/completion counter/center acknowledgement, or the legacy fallback result. Therefore a longer dance outlives its finite audio even though main's finally has not run.

Only software playback changes: motion-owned dance/custom commands set loop=true; previews, generic music playback and attention/nod/search cues remain one-shot. Both generated beats and selected local files use the same lifetime. Request-scoped completion stops only its own generation, while explicit global stop/emergency stop remains immediate. Stale stop/load/play callbacks cannot disrupt a newer generation. Failed media releases its URL and does not report successful motion. No change to firmware, motion sequence, physical duration, limits, HID or completion evidence; no hardware action was invoked for validation.

## Verification

- 11 new T58 cases: built-in/local loops, one-shot preview/non-dance, stale stop/end, stopped pending load, load/decode failure, teardown, awaited preset/custom completion, error cleanup, fallback lifetime, superseding preview and scoped finalizer.
- Full sequential suite 842/842. Initial focused test exposed a T19 source assertion pinned to the old call signature; it now asserts explicit followMotion=true. Build identity tests assert T58.
- Isolated React/preload UI 34/34 at 1440x1024 and 960x680; OS Temp output `deskmate-workbench-qa-s1ZZGn`. Injected overview error is an intentional test fixture. This does not simulate successful hardware connection or audible real-device synchronization.
- Desktop build, exact archive/resource checks and final-ASAR motion-ownership probe are recorded with final artifact hashes in the top progress entry. Bundle-size and duplicate-dependency build warnings are unchanged.

## User acceptance

After starting T58, run a dance lasting more than 8 seconds (such as an existing repeat/custom action). Music should continue through repeats and stop on reported motion completion. Test explicit stop/emergency stop using the existing controls; music should not continue. If using a selected local song, verify the same behavior. No automatic user-dance execution, media-selection change, API call or user-data deletion is part of this change.

KnowledgeOS search returned only unrelated Wiki snippets, not supporting evidence; they were not used. No work-memory submission.
