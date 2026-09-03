# T16 desktop actions and Codex briefing

Status: `WINDOWS_CODE_BUILD_CONFIRMED / USER_HIL_PENDING / NO_FIRMWARE_CHANGE`

## Goal

Let companion speech invoke only registered, explicitly voice-enabled Windows
applications; answer Codex status questions from trusted state; and accept
bounded task milestones from an opt-in repository reporter.

## Frozen behavior

- Intent types are `open_application`, `query_codex_status` and
  `run_motion_preset` only.
- Application targets must already be registered and separately voice-enabled.
  Paths, arguments, URLs, shell commands and unknown targets are rejected.
- `codex-hook-v1` remains the coarse lifecycle source.
- `codex-task-brief-v1` contains only version/provider, opaque task key,
  user-visible label, bounded state, at most 80 characters of milestone and a
  monotonic sequence.
- The receiver retains at most eight recent tasks. Multiple plausible tasks
  require the user to say the task name.
- Ordinary progress announcements are limited to one per 15 seconds; waiting,
  completed and error are immediate. Answers use fixed templates.

## Repository reporter

`npm run report:codex-task -- --task-key <opaque-key> --task-label <name>
--state <state> --milestone <brief>` sends one report to a running DeskMate. The
first call requires the visible label; later calls reuse it and increment the
local sequence. Reporter state contains no prompt, reply, command, tool data,
path, URL or secret.

## Acceptance

Test one enabled and one disabled registered application, one live reporter
task through working/waiting/completed, a direct status question and a motion
phrase. No firmware write is involved.
