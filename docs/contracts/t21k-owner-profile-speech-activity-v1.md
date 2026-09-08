# T21K owner profile and foreground speech activity

Status: `T21K_OWNER_PROFILE_SPEECH_ACTIVITY_V1_FROZEN`

Windows-only amendment to T21J. The three-stage providers, ten-second configured
foreground idle duration, wake recognizer, audio endpoints and both firmware images
remain unchanged.

## Evidence and behavior

- A sanitized T21J diagnostic reports `listening-idle-timeout` as the only terminal
  reason, zero provider/model/TTS errors, 59 partials and two accepted finals. This
  is a local idle close, not a cloud transport failure.
- The idle duration means ten seconds after the latest listening activity. Provider
  speech-start evidence and each accepted partial refresh that deadline. A final
  continues to own the existing thinking transition. Noise during playback does not
  refresh the deadline because playback events are not in listening state.
- If speech starts but no final ever arrives, the refreshed bounded deadline still
  closes the session; the fix cannot keep a broken recognizer alive indefinitely.
- Content-free diagnostics expose only speech-start, partial and timer-refresh counts.
  Recognized text, audio and item identifiers remain excluded.

## Explicit owner profile

- “关于我” is separate from the companion's own persona. It stores the user's chosen
  form of address plus optional occupation/identity, current focus, age/life stage and
  other background in the existing local persona document.
- Existing version-2 persona files migrate by normalization to version 3 with blank
  optional profile fields. Blank means unknown. DeskMate cannot infer or auto-fill it.
- The profile is sent only to the configured DeskMate text model as user-explicit data.
  It is not a command, cannot override safety/tool boundaries, is not sent to firmware
  and is never included in diagnostic exports.
- Profile data is distinct from recent dialogue and reviewed long-term memory. Saving
  it affects the next new companion session. Automatic summaries cannot silently edit it.

## Verification

Synthetic tests cover migration/defaults, length bounds, prompt-data separation and a
speech-start/partial arriving near the previous idle deadline. User acceptance remains
required for a natural pause followed by late speech and for profile-aware answers.
