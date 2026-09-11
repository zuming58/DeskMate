# T25 KnowledgeOS integration and hourly/daily memory

- Status: `DESKMATE_IMPLEMENTED / SYNTHETIC_VERIFIED / LIVE_IDENTITY_CONFIGURATION_PENDING`.
- User request: 2026-09-11; query KnowledgeOS and deliver complete daily memory, with local hourly processing and a configurable evening summary time.
- Specification and cross-project handoff: [knowledgeos-memory-integration-2026-09-11.md](../../docs/handoffs/knowledgeos-memory-integration-2026-09-11.md).

## Scope

Reuse the existing companion/dictation store, daily schedule, backlog processing and Markdown projection. Hourly checkpoints, a date-named combined local preview, class-specific work/personal journals, complete-coverage finalization, a durable two-entry delivery queue and bounded KnowledgeOS retrieval adapter are implemented. KnowledgeOS owns its receiver, identities, knowledge compilation and tutorial.

The user clarified: close the workday at a configurable time (23:30 suggested), or with “提前结束今天并同步”; post-cutoff records belong to the next workday while preserving actual timestamps. Automatic closure skips a day already manually closed. Add configurable raw-text retention; 20 days is the proposed default, with successful-summary/optional-delivery gates and clear deferred-cleanup status. Daily summaries and accepted long-term memory remain separately retained.

Nightly synthesis re-examines all eligible raw final records in that workday, including records already consumed by hourly jobs. Hourly summaries are cross-checking aids. It reviews bounded complete batches, repairs omissions/misreadings, deduplicates, and extracts evidence-backed lessons. The local combined preview contains two sections, while KnowledgeOS receives exactly two sealed submissions: `memory_class=work` with an optional authorized project and `memory_class=personal` with `project_id=null`. Both retain workday/source provenance. Inferred personality, assistant suggestions and dictated third-party text do not become established personal facts.

## Open boundaries

Live use requires selecting the official KnowledgeOS MCP adapter and configuring the dedicated DeskMate Credential ID. Remote correction/retraction and automatic sourced-material promotion into a confirmed digital person remain receiver-side follow-up work. Local raw retention is active with a default of 20 days and cannot delete KnowledgeOS Raw.

## Verification

Synthetic coverage verifies source separation, hour/day ownership, full raw reread, late records, exactly two immutable deliveries, personal project isolation, idempotency, encrypted adapter configuration, bounded retrieval and local-only cleanup gates. Live receiver/ACL and cross-device acceptance remain pending configuration. Existing voice/key/hardware state is outside this task.
