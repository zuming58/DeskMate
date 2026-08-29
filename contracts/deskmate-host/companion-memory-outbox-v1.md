# DeskMate Companion memory outbox v1

Status: `MEMORY_OUTBOX_V1_FROZEN`

Scope: a pure Windows-side domain contract for reliably queuing completed Companion events for later summarization and memory extraction. This slice defines no database engine, encryption implementation, embedding provider, Wiki writer, reminder scheduler, cloud call, UI, IPC, audio, firmware, or DeskMate Link behavior.

## Accepted source events

Only completed, bounded events may enter the outbox:

| Kind | Required payload | Purpose |
| --- | --- | --- |
| `conversation.turn_final` | `role: user | assistant`, non-empty `text` | A finalized conversational turn; never an ASR or reply partial. |
| `tool.result` | `toolCallId`, `toolName`, `status: succeeded | failed`, bounded `summary` | A completed tool outcome suitable for later episodic summary. |
| `memory.explicit_request` | non-empty `text` | The user explicitly asked DeskMate to remember something; it is still a candidate until later confirmation policy is applied. |

Audio bytes, ASR partials, streaming reply fragments, credentials, raw device paths and arbitrary unknown event kinds are rejected. Text is not silently truncated. The initial per-field text limit is 16,384 Unicode code units.

## Identity and ordering

Each source event has a caller-generated stable `eventId`, a `sessionId`, and an ISO timestamp `createdAt`. IDs are 1–128 characters and use only ASCII letters, numbers, `.`, `_`, `:`, or `-`.

The outbox assigns an increasing local `sequence`. Pending claims use this sequence, so processing order is deterministic even when two events have the same timestamp.

Submitting the same `eventId` and canonical content is idempotent and does not create a second entry. Reusing an `eventId` with different content fails closed as an identity collision.

## Lifecycle

```text
pending -> processing -> completed
             |
             +-> pending (explicit release or startup recovery)
```

- Claiming is bounded by `limit`, records `workerId`, `claimedAt`, and increments `attempts`.
- Only the current worker may complete or release its claim.
- Completion means derived outputs have already been durably committed by a future persistence adapter; this pure domain slice only records the acknowledgement.
- Startup recovery returns every `processing` item to `pending`, clears its lease, and leaves `completed` items unchanged.

## Privacy and retention boundary

This contract does not authorize long-term transcript retention. It queues finalized text only as short-lived recovery material for a later, user-controlled persistence policy. It never stores audio or partial text and never writes `F:\wiki`. Deletion, expiry, encryption, memory candidates, reminders, daily summaries, embeddings and Wiki export remain separate slices.

## Required tests

1. Final turns are accepted while partial/unknown/audio-bearing events are rejected.
2. Exact duplicate event IDs are idempotent; conflicting duplicates fail closed.
3. Claims are FIFO, bounded, and cannot be completed by a different worker.
4. Release returns a claim to pending without changing its sequence.
5. Startup recovery requeues processing entries and preserves completed entries.
