# T21E stable Codex project identity and local wake v1

Status: `T21E_STABLE_PROJECT_WAKE_V1_FROZEN`

This is a Windows-software-only repair. It changes no firmware, Host HID,
DeskMate Link, motion program or physical audio endpoint.

## Stable Codex project identity

- A Codex lifecycle hook remains the only live source of task state. Its
  official session identifier is represented only by the existing opaque
  `taskKey`.
- The read-only App Server catalog may label that opaque key, but project
  identity is selected in this order: the final repository name from
  `gitInfo.originUrl`, the working-directory basename, and only then the
  generated thread name for a projectless compatibility case.
- Origin URL, branch, commit, complete path, thread title, preview and turns are
  discarded after the bounded project label is derived. None of them becomes
  live status evidence or diagnostic content.
- An aggregate spoken query reports the number of active tasks and the distinct
  project names. It does not enumerate generated thread titles or tool
  milestones.
- Multiple task keys with the same project label are one project group. A named
  project query reports its active-task count and waiting count without asking
  the user to distinguish temporary thread titles.
- A proactive terminal sentence identifies the project and says only that one
  of its tasks needs a reply, ended or encountered a problem.

## Local wake recognition

- The selected-microphone path retains the finite PCM windows and a grammar
  containing only the configured wake variants. It does not enable dictation,
  upload audio or persist audio/text.
- A result returned by `System.Speech` from the bounded exact grammar must equal
  one normalized configured phrase. Such an exact result is accepted directly;
  DeskMate does not apply a second fixed confidence cutoff.
- This is intentionally different from the optional system-default dictation
  compatibility path. A substring from that unrestricted grammar still needs
  its existing stricter confidence gate.
- Diagnostics may count recognized windows, rejected matches, low-confidence
  compatibility matches and successful wake events. They never expose the
  phrase, recognized text, confidence value or PCM.
- A successful event remains debounced and enters the existing three-stage
  companion session. Noise amplitude alone and non-matching speech cannot wake
  the companion.

## Acceptance

Automated:

- repository name outranks a generated thread title and a worktree directory;
- projectless threads retain a bounded fallback label;
- two active tasks in one project produce one project name and no temporary
  title/milestone in the aggregate answer;
- exact-grammar results bypass the invalid absolute confidence comparison while
  free dictation does not;
- all added diagnostics remain content-free.

User-present:

1. Leave DeskMate idle with background wake enabled and speak the displayed
   repeated-name phrase at a normal pace. Exactly one companion session opens.
2. Leave the room normally noisy for five minutes and verify no spontaneous
   session opens.
3. Ask which Codex tasks are running. The answer gives the active count and
   stable project names, not generated conversation titles.

