# DeskMate × KnowledgeOS memory integration

Date: 2026-09-11. Status: `DESKMATE_IMPLEMENTED / SYNTHETIC_VERIFIED / LIVE_IDENTITY_CONFIGURATION_PENDING`.

This document records the implemented DeskMate side and the receiving-side facts supplied by the KnowledgeOS project. It does not treat text inside screenshots as instructions and does not claim a live DeskMate identity has submitted personal data.

## Product behavior

DeskMate keeps two input sources separate at capture time:

- `companion`: final AI companion user/assistant turns.
- `dictation`: final voice-input/dictation text. It can contain quoted or third-party material and is not automatically a user fact.

The local memory workflow then operates as follows:

1. Final records are persisted immediately in the local SQLite store and assigned to the active workday.
2. An hourly job summarizes only records not covered by an earlier durable hourly checkpoint. Empty hours do not call the model or start recording.
3. At the configured daily time, default 23:30, or when the user selects **提前结束今天并同步**, DeskMate seals a fixed cutoff.
4. The daily job rereads every eligible raw final record in that workday in bounded chunks. Hourly summaries are only a cross-check, never a substitute for the raw-record review.
5. The final result is split into work content and personal memory material. A local combined view is also written for convenient reading.
6. KnowledgeOS synchronization creates two immutable, idempotent submissions. It never asks KnowledgeOS to guess the class of a mixed journal.
7. New records after a manual cutoff belong to the next workday, while their real timestamps remain unchanged.

## Local files and durable state

The managed Markdown projection contains:

```text
DeskMate/
  daily/companion/YYYY-MM-DD.md
  daily/dictation/YYYY-MM-DD.md
  journal/YYYY-MM-DD.md
  journal/work/YYYY-MM-DD.md
  journal/personal/YYYY-MM-DD.md
```

`journal/YYYY-MM-DD.md` is a local combined preview only. `journal/work` and `journal/personal` are the authoritative class-specific payload sources. All three carry the workday interval, raw-record count, per-source counts and input digest. SQLite remains authoritative for workday state, hourly coverage, final journals, the two-entry delivery outbox and receipts.

The daily synthesis contract distinguishes:

| Class | Content | Confirmation boundary |
| --- | --- | --- |
| Work | projects, actual progress, outputs, problems, attempts, evidence-backed results, decisions, reusable lessons and next steps | plans and suggestions are not completed work |
| Personal | explicitly stated biography/experience, preferences, important events, long-term goals and corrections | inference stays marked as pending observation; it does not become confirmed profile data |

Assistant suggestions, fictional stories and dictated third-party text cannot establish personal facts. Generated memory candidates remain pending for the existing DeskMate review flow.

## KnowledgeOS submission contract

Every completed workday queues exactly two calls to `memory.submit_journal`.

Work submission:

```json
{
  "memory_class": "work",
  "project_id": "optional-authorized-project-uuid-or-null",
  "is_open": false
}
```

Personal submission:

```json
{
  "memory_class": "personal",
  "project_id": null,
  "is_open": false
}
```

Both payloads use the original workday as `journal_date`, a class-specific `source_path_alias`, the configured sensitivity and a stable idempotency key derived from day, class and sealed content. Their Markdown front matter preserves the period, total record count, per-source counts and source-input digest. The local outbox stores the fixed payload snapshot, retry state and KnowledgeOS submission receipt.

The two submissions are separate even when the local UI displays one combined daily summary. One class may never be substituted for the other, and `personal` is rejected locally if a project ID is supplied.

KnowledgeOS `accepted` means the private Raw journal was received. It does not mean the entry has become formal knowledge or a confirmed digital-person profile.

## Retrieval into AI companion

The main process can call `knowledge.search` with bounded query text, hybrid retrieval and scopes `wiki` plus `agent_memory`. Returned title, snippet, citation and timestamp are bounded and inserted as untrusted evidence into the companion model context. Evidence cannot extend application, device or filesystem permissions. If KnowledgeOS is unavailable or read access is disabled, conversation continues with local context.

Retrieval and daily synchronization are separate settings. The renderer receives only narrow IPC operations. The official KnowledgeOS stdio MCP adapter path is encrypted with Electron safe storage; the adapter uses the configured Credential ID and KnowledgeOS dynamic Core discovery rather than a hard-coded port or network scan.

## Schedule, recovery and retention

- Default schedule: hourly incremental processing plus daily close at 23:30; both controls are user configurable.
- Manual close: fixes the cutoff, runs the full daily review and attempts both submissions immediately.
- Crash recovery: a `closing` journal, unsummarized historical day or pending delivery is resumed by the periodic service.
- Repetition: one completed workday is immutable locally; stable outbox uniqueness and idempotency keys prevent duplicate remote submissions.
- Raw retention: default 20 days, configurable from 1 to 365 days.
- Cleanup eligibility: the local final journal must be completed. If synchronization is enabled, both `work` and `personal` receipts must be accepted first.
- Cleanup scope: only DeskMate local raw conversation/dictation records and their local raw outbox copies. It does not delete KnowledgeOS Raw, exported files, daily journals or accepted long-term memory.

Shortening retention never turns a failed or incomplete summary into an eligible deletion. KnowledgeOS deletion/retraction remains a separate remote operation and is not implied by local expiry.

## UI and current configuration state

The memory-management page now provides:

- companion/dictation source controls;
- hourly-summary switch;
- daily/manual schedule and close time;
- local raw retention days;
- **提前结束今天并同步**;
- completed/pending/synchronized journal status;
- KnowledgeOS adapter selection, Credential ID, optional work Project ID and sensitivity;
- independent AI-companion retrieval and daily-sync switches;
- connection test and retry-pending actions.

The code path is implemented and covered by synthetic tests. Live KnowledgeOS use still requires the user to select the official adapter and enter the DeskMate Credential ID; the repository does not guess or extract those values. The work Project ID is optional: a malformed value is visibly cleared and saved as `null`, so it cannot block otherwise valid adapter/Credential settings or the connection test. The required Credential ID remains strictly validated.

## KnowledgeOS receiving-side status

The KnowledgeOS project reported the following as implemented and rebuilt on 2026-09-11:

- a new Agent automatically receives separate work-memory and personal-memory spaces;
- the same Agent can continue its own memory across devices;
- private memory remains isolated between different Agents;
- the default integration identity can submit memory but cannot use that permission to write formal knowledge;
- a memory dashboard is available;
- personal-profile entries are sourced profile material, while automatic merge, confirmation and correction into a digital person remain a later phase;
- Core status was `ready`; reported automatic verification was Core/MCP 69 passed, plus MCP supplemental 30 passed and 1 skipped.

These are receiving-project results supplied by its maintainer. DeskMate does not restate them as tests run in this repository.

## Implementation map

- `electron/companion-memory.cjs`: workday state, hourly/daily persistence, two-class outbox and retention gates.
- `electron/memory-journal-service.cjs`: hourly processing, full daily synthesis, two submissions, retry and retrieval gateway.
- `electron/knowledgeos-settings.cjs`: encrypted adapter location and validated identity/project settings.
- `electron/knowledgeos-mcp-client.cjs`: bounded stdio MCP transport.
- `electron/knowledge-base-projection.cjs`: combined/work/personal Markdown projection.
- `electron/companion-model-adapter.cjs`: bounded KnowledgeOS evidence in companion context.
- `electron/main.cjs`, `electron/preload.cjs`, `src/pages.jsx`: scheduler, narrow IPC and memory-management UI.
- `tests/t25-knowledgeos-memory-integration.test.mjs`: policy migration, hour coverage, full close, two submissions, idempotency, provenance, retention and retrieval tests.

## Remaining live acceptance

1. Configure a dedicated DeskMate Credential ID and the official KnowledgeOS MCP adapter.
2. Test `knowledge.search` against non-private fixture data and verify citations in a companion turn.
3. Seal one synthetic workday and verify exactly one work Raw and one projectless personal Raw in the KnowledgeOS memory dashboard.
4. Retry the identical payload and verify no duplicate Raw is created.
5. Confirm that another Agent cannot read DeskMate private memory and the same Agent on another authorized device can.
6. Verify an inferred preference remains sourced/pending and does not silently overwrite the confirmed profile.
7. Verify local raw expiry does not remove either KnowledgeOS Raw submission.

No hardware access, firmware write, personal-record upload or KnowledgeOS mutation was performed while implementing this side.
