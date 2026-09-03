# T15C automatic contextual motion

Status: `WINDOWS_CODE_BUILD_CONFIRMED / USER_HIL_PENDING / NO_FIRMWARE_CHANGE`

## Goal

Reuse the user-accepted T15D semantic action path to add restrained, opt-in
movement during companion and Codex activity without adding a new HID or Link
contract.

## Product behavior

- One persisted global switch defaults off.
- Starting a companion session requests `attention` once.
- A continuous `thinking` state requests `search` once after four seconds.
- A successful application-open or Codex-status confirmation requests `nod`
  only after the companion answer has completed.
- A trusted Codex completion requests `nod`; the existing completed Agent state
  owns the happy expression.
- Optional idle search defaults off and waits 90 seconds. Voice activity,
  companion activity, manual control, another motion, emergency stop or fault
  skips the request without queueing or later replay.
- Dance remains explicit: UI, voice, or the currently activated custom dance.

## Priority and boundary

`emergency/fault > recovery/recenter > manual > explicit voice > context > idle`.
The Windows coordinator sends only the accepted `attention`, `nod` or `search`
program through `ChoreographyService`. It never emits PWM, GPIO, pulse width,
arbitrary angles or repeated manual steps. Both firmware applications remain the
accepted T15D images.

## Acceptance

Enable the total switch only after the normal quick actions pass regression,
then verify companion start, delayed thinking, completed confirmation and Codex
completion one at a time. Enable idle search separately and confirm that active
voice/manual/motion work suppresses it without a delayed replay.
