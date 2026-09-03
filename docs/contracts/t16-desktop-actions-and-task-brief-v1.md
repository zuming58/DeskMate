# T16 desktop actions and Codex task brief v1

Status: `T16_DESKTOP_ACTIONS_TASK_BRIEF_V1_FROZEN`

This Windows-only slice extends the T13 persona, memory and intent boundary.
It does not change VoiceWorkflow, HID, DeskMate Link, firmware, global Codex
configuration or hardware behavior.

## Typed intent boundary

The classifier may return only `none`, `open_application`,
`query_codex_status`, or `run_motion_preset`.

- `open_application` names only an already registered opaque AppAction UUID.
  Registration stores a local `.exe` or `.lnk` target in Electron main.
- Every application has an explicit `voiceEnabled` boolean. Existing records
  migrate to `false`; adding a record also defaults to `false`.
- When and only when `voiceEnabled=true`, a matched registered application may
  open without another per-call confirmation. Paths, arguments, URLs, shell
  commands and unregistered labels remain invalid input.
- `query_codex_status` reads trusted local status and returns deterministic
  copy; the language model does not invent status or percent complete.
- `run_motion_preset` carries only one of attention/nod/search/dance and is
  wired to T15 after the motion transport is present. No model emits angles,
  PWM, GPIO, pulse width, velocity or arbitrary device data.

Renderer output contains only a bounded action label, type and sanitized
result. Secrets and local target paths remain in Electron main.

## `codex-task-brief-v1`

Rich task progress is accepted only from an opt-in local reporter. Each
newline-delimited JSON message contains exactly:

| Field | Rule |
| --- | --- |
| `version` | exact string `codex-task-brief-v1` |
| `provider` | exact string `codex` |
| `taskKey` | opaque `[A-Za-z0-9_-]`, 8..64 bytes |
| `taskLabel` | user-facing label, 1..60 Unicode code points |
| `state` | `thinking`, `working`, `waiting`, `completed`, or `error` |
| `milestone` | optional user-facing summary, at most 80 code points |
| `sequence` | non-zero u32, strictly increasing per task key |

No additional field is accepted. Labels and milestones reject control
characters, line breaks, URLs, drive/UNC paths, command-like prefixes and
credential-shaped text. The reporter never forwards prompts, responses, tool
names/arguments/results, cwd, transcript/session IDs, window titles, device
identifiers or environment variables.

DeskMate keeps at most eight recent task snapshots in memory. A new session or
sequence rollback does not overwrite a newer record. This channel is advisory
task progress; existing `codex-hook-v1` remains authoritative for coarse
lifecycle and does not acquire content access.

## Query and announcement policy

- Start/thinking announces once.
- Ordinary working milestones announce at most once per task per 15 seconds;
  a newer stored milestone is not lost merely because speech is throttled.
- Waiting, completed and error announce immediately.
- Tool calls are never individually announced and no percentage is inferred.
- If exactly one recent active task matches, “Codex 做完了吗/到哪一步了”
  returns a deterministic label, state and optional milestone.
- If multiple tasks are active and the user did not name one, DeskMate asks
  which task. The user may answer with only the visible task/project name for
  60 seconds; exact normalized labels and unique label terms are accepted,
  while shared terms remain ambiguous. Candidate speech lists at most three
  recent labels and reports the total count when more exist.
- An explicit Codex progress question is a trusted local control turn, not a
  model knowledge question. It bypasses the text-model classifier. After the
  provider's `ASREnded` event, DeskMate sends the exact deterministic answer
  through provider `ChatTTSText` and suppresses that turn's generated free-chat
  partial/final text. The same companion session returns to listening after
  playback drains.
- A missing reporter is stated honestly and falls back only to the coarse
  `codex-hook-v1` state.
- Conversation speech/listening ownership remains above announcements;
  displaced announcements are dropped instead of replayed later.

The first release supports only tasks that explicitly send this contract from
the DeskMate repository. A global reporter/plugin requires a separate package
and user authorization.
