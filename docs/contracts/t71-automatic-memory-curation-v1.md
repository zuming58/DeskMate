# T71 — Automatic, evidence-backed memory curation

Status: FROZEN for this slice, 2026-09-24.

## Explicit scope

The user requests automatic organization, with only problematic records requiring review, and explicitly authorizes the configured text-model service to process the 430 historical candidates and future memory content, including possible personal information and model charges. This supersedes T70's manual-only promotion rule for this opted-in mode, not for unconsented installations. No KnowledgeOS publication/approval, foreign-project collection, raw-record deletion or hardware operation is authorized by this slice.

## Results and evidence

- Preserve every original candidate and conversation. Derived, concise long-term memories are separate accepted rows, with links to original candidates and quoted user evidence; label automatic versus user confirmation honestly.
- Outcomes: remember, merge into an existing equivalent memory, archive routine/transient material, or ask about a concrete conflict/uncertainty. Archive is not deletion and is not a mandatory review task.
- Only explicit supported information can be remembered automatically. Verify quote identity against the selected user turns; assistant text, fictional/quoted dictation, unsupported inference, sensitive claims and conflicting statements cannot be silently promoted. A separate bounded verifier checks proposed long-term statements and duplicates against evidence and existing memories. Validation failure preserves records and fails closed.
- Preserve numbers, negation, time and context. Do not overwrite a contradictory memory by latest-write-wins. Review groups show the actual question and source material; a user's explicit choice can resolve the selected group.
- Revalidate originals, evidence, consent revision and accepted-memory context before committing a model result. Concurrent edit/delete/disable/restore must defeat stale results. Corrections invalidate derived automatic memories; forgetting removes dependent derived records and prevents processed originals from silently recreating a forgotten memory.

## Scheduling and privacy

- Store explicit local opt-in and expose pause/resume. No startup migration may infer consent. Backup restore preserves curation outcomes but clears external-processing consent.
- Process only new/unprocessed authorized sources while the application is idle; daily journal generation and live voice keep priority. Model requests are bounded and processed batches checkpoint immediately. Failures persist exponential retry delays; completed/review groups are not repeatedly sent on polling.
- Curation is independent of journal transport. Missing KnowledgeOS receipts do not authorize resubmission or change acceptance/retention rules.
- UI emphasizes usable memories and actual questions, separately showing pending automatic processing and archived originals. Do not relabel the original 430 as successfully processed before execution.

## Verification and release

Synthetic tests cover grounded acceptance, archive, duplicate grouping, conflicts/uncertainty, forged/assistant quotes, malformed/omitted/foreign IDs, consent withdrawal, stale source/context, bounded retries, no-op cost, correction/deletion and backup restore. Verify retrieval uses new memories, UI actions work at 1440/1024 widths, and final ASAR equals source. Historical live execution requires a consistent backup, the explicit model authorization above and preservation checks before/after. Only install a verified F-drive build into D; no ASAR patching.
