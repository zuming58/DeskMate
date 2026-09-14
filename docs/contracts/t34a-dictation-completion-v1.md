# T34A dictation completion

DICTATION_SESSION_COMPLETION_V1_FROZEN — 2026-09-13

- An utterance `completed` is not a complete dictation. Keep final segments by item ID, deduplicate, and seal only on `session.finished`; provisional preview text never becomes final output.
- Disconnect capture first, drain already submitted audio IPC promises, then send `session.finish`. Do not add `input_audio_buffer.commit` in VAD mode.
- A missing final segment, rejected audio, early close/error or four-second finish deadline uses the complete saved recording through the existing batch adapter. Never silently output a prefix. Cancellation must not start fallback or write text.
- The deadline is an error bound, not a mandatory delay. Record only finalization outcome, wait milliseconds, segment count and allowlisted reason in diagnostics; no text/audio/item IDs.
- Existing VoiceWorkflow, recording retention and target-window output adapter remain shared and unchanged. No live microphone/cloud/output test is implied by synthetic tests.

Protocol references: [server events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-server-events), [client events](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-client-events). The official session finish contract requires pending recognition to complete before the finished event.
