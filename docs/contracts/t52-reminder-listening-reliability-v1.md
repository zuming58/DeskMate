# T52 reminder and listening reliability v1

Status: `T52_REMINDER_LISTENING_RELIABILITY_V1_FROZEN`

This slice supersedes T51's early `notified` delivery rule, without changing its record version or product boundary.

- Chinese time numerals normalize locally. Missing reminder fields are retained in a main-owned, two-minute conversational draft; bounded replies can complete time, morning/afternoon and purpose. Cancellation/expiry discard the draft. No model writes reminder data or guesses missing purpose/ambiguous hours.
- New speech proven to start after the uploaded-audio playback boundary is not rejected merely for reusing an ASR item ID or repeating the preceding answer. Delayed pre-boundary echo and T49 explicit-stop protections remain effective. Audio timeline and utterance details stay internal.
- Due reminders enter durable `delivering`, not `notified`. Only an accepted audio stream followed by successful sink drain confirms notification. Busy delivery queues locally; failure has bounded retries and a visible failed state. Restart recovers interrupted deliveries, with possible at-least-once replay rather than silent loss. Completion is attempt-checked so concurrent completion/snooze cannot be overwritten.
- Reminder time/event time remain unchanged during delivery retries; retry timing is a separate field. Old version-one records remain valid. Manual snooze starts a fresh retry budget.
- Standalone reminders use the existing companion controller/sink with a TTS-only provider mode: no ASR/model construction or microphone capture. Existing conversations retain their normal microphone and volume afterward. No alarm, firmware, HID writes or user-data reset is introduced.
- Verify new regressions, full suite, desktop build/resource checks and isolated affected UI. Real microphone/speaker acceptance remains user-owned.
