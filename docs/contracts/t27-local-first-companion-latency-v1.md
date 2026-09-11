# T27 local-first companion latency

Status: `T27_LOCAL_FIRST_COMPANION_LATENCY_V1_FROZEN`

User authorization: test the configured services and optimize voice response;
do not search KnowledgeOS on every chat. Windows-only amendment to T21/T21J and
T25 retrieval. No firmware, microphone routing, hardware actions or second
VoiceWorkflow. Existing barge-in evidence and acoustic echo safeguards remain.

## Routing and retention

1. Always retain the main-owned 24-hour, 80-message / 32,000-character context
   and refresh the existing approved local-memory retrieval. Wake/reconnect does
   not reset history; corrections/deletions must apply on the next question.
2. Greetings, ordinary conversation and general questions do not query
   KnowledgeOS. Current-dialogue references use current/earlier local context.
3. Historical work, experiences and preferences trigger local recall first:
   retained raw companion text, reviewed memories and dated local daily notes.
   Historical raw dictation is NOT treated as personal facts. A recent unrelated
   accepted memory cannot count as a hit; date-specific questions must match the
   requested date. Date and topic remain heuristic retrieval constraints, not a
   claim that local similarity is a calibrated confidence probability.
4. Explicit knowledge-library/KnowledgeOS requests query remotely. Historical
   questions with no sufficiently relevant local match may fall back remotely.
   Explicit local-only requests never do. No extra model is called to route.
   This rule-based first version does not promise universal intent coverage;
   explicitly asking to query the knowledge library remains an escape hatch.
5. Optional historical remote recall is bounded to 3.5 seconds; explicit remote
   recall to 4.5 seconds, within the whole model-turn deadline. Cancellation
   aborts the MCP child and prevents a stale model request/context append.
   Empty results, unavailable, timeout and skipped are distinct. The assistant
   must not say it searched when it did not or treat a failed lookup as proof
   that a past event never happened.
6. Raw retention is unchanged: default 20 days, only completed local workdays;
   if synchronization is enabled, both work/personal receipts are required.
   Daily journals, approved memories and KnowledgeOS Raw survive local expiry.
   Thus 20 days is NOT a total amnesia boundary or a mandatory remote-only cutoff.
   Daily summaries remain unreviewed evidence, not confirmed user profiles.

Local history search is bounded to 1,500 most recent retained companion rows
within the date interval and 366 dated entries from each summary source. Each
note is chunked, keyword-prefiltered, then at most 48 chunks undergo the existing
local hash-vector ranking; return at most 8 excerpts of 900 characters. Older or
missing evidence can fall back remotely. No loose folder scan or persisted raw
duplicate/vector cache is introduced. Small current-dialogue recall retains its
existing T21J 24-hour boundary.

## Latency changes

- New-profile endpoint preference: 1,500 ms instead of 4,000 ms. Existing saved
  values are not silently migrated for everyone. This user's explicit tuning
  changes only that setting, with a local backup. A user who pauses longer may
  choose 2–3 seconds. Do not lower noise acceptance thresholds for speed.
- Keep production post-playback echo grace at least 6 seconds and missing-barge-
  final recovery at least 5 seconds, independent of the shorter endpoint setting.
- The first generated clause may start TTS at comma/colon after 12 characters;
  later clauses keep full sentence segmentation. Numeric separators and tiny
  fillers do not trigger early speech. Segments must concatenate exactly to the
  final response, with the same interrupt/stale-generation protections.
- Official DeepSeek V4 Flash/Pro companion requests set
  `thinking: {type: "disabled"}`. Do not guess this field for custom providers,
  change a deliberately selected reasoner, or change other text-model workflows.
  Bailian's existing non-thinking companion behavior is unchanged. ASR and the
  configured Doubao caller-text TTS/voice remain the same.

Provider references checked 2026-09-11:
[Qwen-ASR client events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-client-events)
documents silence endpointing and the speed/pause tradeoff;
[DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)
and [model modes](https://api-docs.deepseek.com/quick_start/pricing/) document the
explicit non-thinking request for V4. API documentation is not an acoustic test.

## Measurement semantics and evidence

The existing turn timing origin is first ASR partial receipt, not the person's
physical speech start. Add separate context preparation, local lookup, remote
lookup, actual model HTTP start and model HTTP-to-first-visible-delta durations.
`speechStopToFinalMs` is receipt of provider speech-stop to final, not mouth-stop
latency. `playbackQueuedMs` is the renderer's accepted/scheduled queue receipt,
guarded by turn ID; actual acoustic playback remains unknown/null. Stop falsely
aliasing `playbackStartedMs` to network audio arrival. Diagnostic allowlists
include only bounded durations, counts and routing/status enums; never content.

Explicitly authorized live synthetic probe on the configured services:
`scripts/benchmark-companion-latency.cjs --live --asr`, run with Electron 36.9.5.
It loads credentials only in main, uses an isolated Chromium profile with a copy
of the OS-wrapped encryption key, writes only sanitized measurements, keeps
generated PCM in memory, never opens mic/speakers and never writes user memory.
Three identical neutral text questions per run, TTS already connected; no real
conversation history/persona is sent by this probe. It is not end-to-end HIL.

| Probe | Remote wait per chat (ms) | Text input → first audio (ms), three samples |
| --- | --- | --- |
| T26F baseline | 3160 / 3063 / 3030 | 6680 / 5653 / 11175 |
| Local-first + first-clause | 0 / 0 / 0 | 2636 / 2097 / 2220 |
| Final, also explicit non-thinking | 0 / 0 / 0 | 3175 / 1936 / 1972 |

Important finding: the discovered KnowledgeOS Core PID was absent; both health
and search failed with a refused connection after adapter startup. The baseline
three-second cost was a FAILED optional lookup, not the cost of successful
KnowledgeOS search. Successful remote retrieval on this runtime remains untested.
The final gateway no longer silently equates request failure with an empty match.
Do not claim non-thinking alone improved the cold sample: network/model variance
remains. These small sequential samples are not P95 or causal latency guarantees.

Read-only local lookup on current SQLite took 18 ms for the synthetic history
query (no matches). Synthetic audio fed at real-time speed to the same ASR, with
the same PCM for each threshold pair, yielded 1,752 → 1,294 ms and 1,677 → 1,235 ms
from the end of the supplied synthetic speech buffer to final. This does not
prove a 2.5-second acoustic saving from the configuration difference; provider
endpointing and generated-audio boundaries differ from a human's mouth-stop.
Both settings returned a recognized utterance. Real hesitations, loudspeaker
echo and user-perceived start require the existing user-present regression.

Automated gates: local/current/remote routing, date mismatches, approved versus
unrelated memory, local-only, raw-dictation exclusion, deleted-note invalidation,
bounded/aborted lookup, MCP child cleanup, provider-scoped thinking request,
arbitrary chunk-boundary speech conservation, late playback acknowledgements,
diagnostic redaction and the existing voice/context/noise/barge-in suite.
