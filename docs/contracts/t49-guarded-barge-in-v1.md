# T49 guarded companion barge-in v1

Status: `T49_GUARDED_BARGE_IN_V1_FROZEN`

This is a Windows companion-state-machine correction. It changes no firmware, microphone selection, ASR/TTS provider, endpointing preference, DeskMate Link frame or actuator behavior.

## Problem

Computer loudspeaker playback can leak into the selected microphone. Streaming ASR may briefly produce a plausible longer partial and later revise it to an unrelated short final. T48 allowed a sufficiently stable ordinary partial to cancel the current TTS before that final arrived, so an ASR revision could appear as a false user interruption.

## Interruption policy

- An explicit command containing `停下`, `停一下`, `停下来`, `先停`, `听一下`, `先听我说`, `暂停`, `暂停播放`, `等等`, `等一下`, `等一等`, `住嘴`, `闭嘴`, `别讲话`, `不要讲话`, `别说话`, `不要说话`, `先别说`, `先别讲`, `安静`, `别说了`, `别讲了`, `打住`, `我来说`, `让我说` or `换个问题` may interrupt on its first non-echo partial, but only after ASR has opened the matching speech item.
- All other partial hypotheses are evidence only. They never cancel model/TTS/speaker playback.
- A non-explicit final must contain at least five meaningful characters, cover at least 900 ms of provider speech time, and agree with either a provider-confirmed partial or two stable evolving partials.
- When the provider emitted no partial, a non-explicit final requires at least eight meaningful characters and 1200 ms. This preserves long natural interjections without treating a sparse short sound as speech.
- Echoes, filler, non-speech labels, short finals, mismatched item IDs and finals inconsistent with preceding evidence are rejected without opening a replacement model turn.

## Privacy-safe evidence

Diagnostics may report aggregate counts for explicit accepts, final-evidence accepts, deferred partials and inconsistent-final rejects. Candidate text, assistant text, item IDs, audio, device identity and timing sequences remain excluded from exported diagnostics.

## Acceptance

- Explicit commands including `停下`, `听一下`, `等等`, `暂停播放`, `住嘴`, `闭嘴` and `别讲话` interrupt from the first matching partial.
- An ordinary stable partial does not interrupt before its final.
- A consistent completed natural interjection can still interrupt.
- A longer partial followed by an unrelated short final does not interrupt or reach the model.
- Existing manual stop, reconnect, drain, trusted-response, memory and hardware behavior remains unchanged.
