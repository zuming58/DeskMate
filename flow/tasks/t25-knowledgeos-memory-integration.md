# T25 KnowledgeOS integration and hourly/daily memory

- Status: `REQUIREMENTS_RECORDED / WORKDAY_CLOSURE_CONFIRMED / IMPLEMENTATION_PENDING`.
- User request: 2026-09-11; query KnowledgeOS and deliver complete daily memory, with local hourly processing and a configurable evening summary time.
- Specification and cross-project handoff: [knowledgeos-memory-integration-2026-09-11.md](../../docs/handoffs/knowledgeos-memory-integration-2026-09-11.md).

## Scope

Reuse the existing companion/dictation store, daily schedule, backlog processing and Markdown projection. Add hourly checkpoints, a merged date-named daily journal, finalization with complete coverage, a durable final-journal delivery queue and a bounded KnowledgeOS retrieval adapter. KnowledgeOS owns its receiver, identities, knowledge compilation and tutorial.

The user clarified: close the workday at a configurable time (23:30 suggested), or with “提前结束今天并同步”; post-cutoff records belong to the next workday while preserving actual timestamps. Automatic closure skips a day already manually closed. Add configurable raw-text retention; 20 days is the proposed default, with successful-summary/optional-delivery gates and clear deferred-cleanup status. Daily summaries and accepted long-term memory remain separately retained.

Nightly synthesis must re-examine all eligible raw final records in that workday, including records already consumed by hourly jobs. Hourly summaries are cross-checking aids. Review complete bounded batches, repair omissions/misreadings, deduplicate, and extract evidence-backed lessons. The final single dated Markdown contains two content classes: work (projects, actual progress, problems, outcomes, lessons, decisions/todos), and user long-term memory (explicit biography/experiences, preferences, important events and goals). Retain source provenance and confirmation state; do not silently promote inferred personality or assistant suggestions to established personal facts.

## Open boundaries

Workday closure is confirmed. Immutable sealed-journal corrections/retraction, memory-only permission enforcement, private-memory precision reading and stable client identity must align with the receiver. The document proposes concrete behavior without declaring the cross-project contract frozen. Retention is a proposed configurable policy; no automatic deletion is active.

## Verification

Use synthetic records and a fake receiver for source separation, restart/catch-up, hour/day ownership, zero-content skip, model failure, late records, duplicate delivery, revisions, recall/ACL and deletion propagation. Existing voice/key/hardware state is outside this task. No live memory submission is authorized by a design review.
