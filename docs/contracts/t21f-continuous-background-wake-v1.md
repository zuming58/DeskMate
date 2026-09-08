# T21F continuous Windows background wake v1

Status: `T21F_CONTINUOUS_BACKGROUND_WAKE_V1_FROZEN`

This is a Windows-software-only repair. It changes no firmware, Host HID,
DeskMate Link, motion program or physical board-audio endpoint.

## Input ownership

- While DeskMate is idle and local wake is enabled, the Windows computer
  microphone is the only background wake endpoint. EasyInput may remain an
  explicitly selected foreground conversation source; Xiaozhi's retained
  microphone is not initialized in DeskMate V1.
- When the DeskMate microphone selector is `system-default`, one Windows
  `System.Speech` engine owns the system default input continuously. Audio is
  not divided into independent recognition windows.
- When the user explicitly selects a particular Windows microphone, the
  existing renderer adapter supplies bounded PCM for that device. This
  compatibility path remains fail-closed and must not silently substitute a
  different device.
- Dictation, voice editing, companion conversation and microphone tests pause
  the idle listener. Releasing the foreground owner resumes it. Merely hiding
  the window does not stop wake; quitting DeskMate does.

## Recognition and privacy

- The recognizer loads the bounded configured phrase grammar. The continuous
  system-default mode may additionally use its existing local dictation
  compatibility grammar with the stricter acceptance gate.
- Exact bounded-grammar matches retain T21E acceptance and debounce rules.
- Windows recognition events are consumed by the listener process event queue,
  not by PowerShell callback script blocks that require an unavailable runspace.
- The listener emits only `ready`, speech-detected/rejected counts and a wake
  event. Recognized text, phrase, confidence and PCM are neither returned nor
  persisted.

## Acceptance

Automated:

- continuous mode starts on the Windows system default endpoint and reaches
  `listening`;
- its event loop does not use PowerShell speech callback script blocks;
- an explicit microphone switches to the bounded selected-device path;
- foreground ownership, restart bounds, privacy and debounce regressions pass.

User-present:

1. Leave DeskMate idle with wake enabled and the microphone selector on system
   default. Without pressing a key, say the displayed repeated-name phrase.
2. Exactly one companion session opens.
3. After it closes, the listener resumes and a second deliberate phrase opens
   one new session.
4. Ordinary room sound for five minutes does not open a session.

