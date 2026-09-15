# T51 reminder and post-playback listening diagnosis

Date: 2026-09-15. Scope: user-provided redacted diagnostics, current DeskMate source, local synthetic probes. Diagnosis only; no implementation, running-app replacement, hardware operation or paid provider probe.

## Observed runtime evidence

- Report identifies `t51-personal-reminders`, computer microphone and computer speaker. ASR/provider/dialog/transport errors are zero; all ten audio drains completed with zero timeout. This does not prove the microphone captured every human utterance.
- Last pipeline counters contain 27 post-playback echo drops, 48 weak interruption rejects and one inconsistent-final reject. The outer controller reports 61 playback-phase ASR suppressions and 142 gated microphone chunks. Counts refer to events/chunks, not the number of lost human sentences; text-free diagnostics cannot establish which were real echoes versus human speech.
- The normal conversational microphone uplink is allowed in listening, thinking, speaking and draining for the three-stage provider. Thus the report does not support a blanket claim that recording stops after every reply.
- One completed model turn reached first delta in 1342 ms; another in 1351 ms. A cancelled turn reached first delta in 12547 ms with two HTTP attempts and one retry. Its speech-stop-to-final interval was 259 ms. This slower turn is not explained by recognition alone, and no remote memory lookup was recorded for these turns.
- The report has no dedicated reminder parse/save/delivery projection. It cannot identify the precise recognized wording or prove which reminder failure branch occurred in the user's test.

## Reproduced reminder gaps

Source: `electron/personal-reminders.cjs`, time pattern and stateless parser; `electron/companion-intent-bridge.cjs`, reminder ownership checks. All utterances below are synthetic reproduction inputs, not captured user transcripts.

- `明天下午六点提醒我去开会` returns `personal-reminder-time-missing`; the time pattern accepts Arabic digits only.
- `明天下午6点提醒我去开会` successfully parses an event/reminder with title `去开会`.
- `明天6点提醒我去开会` asks for morning/afternoon. This ambiguity guard is intentional, not a fault.
- A following `下午6点` is not recognized as a reminder intent. No pending reminder draft exists across turns, so the answer cannot complete the original request.
- A time-only request also needs a reminder purpose; no purpose should be invented. A future conversational completion flow must ask for the missing field and retain known fields for a bounded period.
- Previously identified delivery gap remains: due claiming persists `notified` before speech, while `announce()` may fail when a companion is not in listening. Scheduler ignores the delivery return value; even successful start/enqueue is not proof of audible completion. This is a separate code gap, not proven to have caused the creation failure in this report.

## Reproduced listening risk

Source: `electron/three-stage-companion-provider.cjs`, `armPostPlaybackEchoTail`, `isPostPlaybackEchoEvent`, `handleAsrEvent` and `playbackDrained`.

- Playback drain arms a 6500 ms residual echo window. The UI/controller then returns to listening, independently of this filter.
- When no tail item ID is known, text similarity is used. A synthetic previous answer containing `明天下午6点` makes a fresh final with that same phrase count as residual echo; an unrelated longer question does not count as echo.
- When an old tail item ID is known and a synthetic newly started utterance reuses it, the predicate rejects even unrelated new text solely because the IDs match. Actual ID reuse in this user's session is not established by the exported diagnostics.
- Existing tests cover residual echo rejection and a new non-overlapping utterance, not these two collision cases. The 27 reported drops make false post-playback suppression a leading explanation, but do not prove all 27 were human speech.

## Proposed next implementation package

1. Parse Chinese time numerals and add bounded multi-turn reminder draft completion for time, period, day and purpose. Save confirmation must reflect actual durable creation.
2. Make post-playback rejection use start timing and text evidence rather than item identity alone; preserve delayed genuine echoes and the accepted T49 explicit-stop protection. Surface real input activity without exposing transcript content in diagnostics.
3. Separate reminder claiming, pending delivery, audible completion and failed delivery; retry busy/failed delivery without false `已提醒`. Use a TTS-only path for standalone reminders rather than opening ASR.
4. Add content-free parse/save/delivery outcomes and post-playback reject reason counters, plus new synthetic collision tests. Then request real microphone/public-speaker acceptance from the user.

## Verification and limitations

- Direct current-source parser and echo-predicate probes reproduced the gaps above without network, user-store writes or real audio.
- Focused baseline: `node --test tests/t51-personal-reminders.test.mjs tests/t21-three-stage-streaming-companion.test.mjs tests/companion-conversation.test.mjs`: 73/73 passed, zero failure/skip. Passing these existing tests does not cover the new gaps or constitute a fix.
- KnowledgeOS authorized `wiki` search returned zero matching T51/T49 records with no index degradation. No relevant citation could be selected for detailed retrieval; conclusions above use local source/report evidence. No memory submission was authorized or performed.

