# T12A desktop companion pause, identity and call

Status: `WINDOWS_CODE_BUILD_CONFIRMED / USER_HIL_PENDING / NO_FIRMWARE_CHANGE`

## Goal

Make continuous companion dialogue tolerant of natural intra-utterance pauses, end truly abandoned listening sessions, give the companion one configurable identity, and add a reserved EasyInput call action without changing firmware.

## Included

- Persistent companion-only 2/3/5-second provider endpointing.
- Independent 30/60/120/off listening idle timeout.
- Default identity `小言` and configured future wake phrase `你好，小言`.
- Versioned unavailable wake-word adapter boundary.
- Reserved `host_action_v1` UUID and S1-S8 mapping/test UI.
- Diagnostic privacy, migration and automatic tests.

## Excluded

- Any firmware/HID/GPIO change.
- Background microphone, cloud wake, wake engine/model bundling or a claim of real wake support.
- Rewriting T11D.6 half-duplex, normal dictation endpointing or VoiceWorkflow.
- OLED, servo, EasyInput speaker, Xiaozhi audio and hardware control.

## Stop gate

Clean install, full tests, Windows package and differential boundary checks are complete. Progress/handoff, commit and push close the software package. Physical key and five-second-pause acceptance remain user-present HIL.
