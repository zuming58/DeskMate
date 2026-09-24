# T70 — Memory delivery recovery and optional candidate review

Status: FROZEN for this software slice, 2026-09-24.

## Delivery

- Preserve the original outbox payload, source scope and idempotency key. Never regenerate a completed journal merely to retry transport.
- Normalize KnowledgeOS snake_case error codes to safe kebab-case; never expose error detail, credentials or raw journal content.
- A missing/invalid old receipt is an item-level exception, not a global network outage. Mark it unconfirmed with a bounded recheck and continue newer receipts/deliveries. Rotate forced receipt checks by their next-check timestamp.
- Authentication, protocol and transport failures still stop the batch and use persistent 5/15/30/60-minute backoff. An item validation failure does not starve unrelated new journals.
- Accepted is not sealed. Only completed/raw_sealed receipts permit confirmed-sealed counts and retention eligibility. Missing historical receipts are not automatically re-submitted, reclassified as success, or discarded.

## Candidate organization

- Daily synthesis is the final candidate selection, capped at ten unique entries. Do not append per-chunk extraction candidates again. Full dated summaries remain independent from candidate approval.
- Candidate collection is optional material, not a list of tasks requiring approval. Ordinary project/decision notes can be classified locally as reference material; uncertain/sensitive keyword matches and other kinds remain optional review. Classification is a conservative heuristic, not a guarantee of sensitivity detection or semantic truth.
- New daily candidates receive local type classification. Historical local classification preserves every original row, summary, source, date and state. Topic groups retain separate originals; numeric/negative statements are not semantically collapsed.
- Model-assisted topic grouping is an optional explicit action. Show that candidate content may contain personal/sensitive information and will go to the currently configured text-model provider, with costs; require explicit consent in trusted IPC. Local classification makes no network calls. No automatic bulk historical model processing on startup or after restore.
- Model grouping is bounded to 50 entries/10,000 characters per call and 12 calls per action; partial batches are checkpointed. Unknown/duplicate IDs or malformed output fail closed. Omitted entries remain reviewable. Neither local nor model grouping sets accepted/rejected or rewrites original content.
- Derived `memory_candidate_reviews` annotations carry a content fingerprint and method. Changed originals invalidate annotations. Foreign-key cascade removes annotations only when the corresponding original is explicitly forgotten. Existing portable backups preserve original candidates; derived grouping caches may be rebuilt and are not authority for accepted facts.
- Explicit batch review acts on selected IDs and fingerprints (max 200), with a visible second confirmation. Revalidate the entire selection in one transaction. One stale/reviewed/deleted item rejects the whole batch. No default selection or approve-all shortcut.
- Preserve individual correction, ignore and confirmed deletion via the original-candidate view. Unapproved candidates never become confirmed profile or accepted long-term retrieval; dated journals/history remain available through existing attributed-evidence retrieval.

## Maintenance and release

- Source changes stay in the canonical F-drive worktree. Installed D-drive files are updated only via the verified installer, not by editing ASAR.
- The renderer is shipped as its production bundle. React/Tabler/Vite are build-only dependencies; pinyin/Sherpa/WebSocket remain runtime dependencies. Scope-only lock changes must not upgrade dependencies, and final-ASAR UI/native checks remain release gates.
- `scripts/repair-memory-queue.cjs` requires explicit offline-profile confirmation and creates a SQLite snapshot before any repair. Sync is limited to the authorized existing queue and receipts, never summary generation. `--local-only --organize-local` performs no external calls.
- Additional model processing requires separate informed authorization. Keep original candidate counts and accepted counts in maintenance output; do not log their text. Pending sync, remote acceptance, sealed receipts and historical exceptions are distinct outcomes.

## Verification

Run `node --test tests/t70-memory-recovery.test.mjs tests/t66-release-audit.test.mjs tests/t25-knowledgeos-memory-integration.test.mjs tests/memory-controls.test.mjs`, full `npm test`, production desktop/NSIS build, isolated UI interaction at 1440×1024 and 1024×768, and final ASAR/source equality checks. Real queue recovery uses the authorized profile only after a backup; fixture tests cannot establish live remote storage.
