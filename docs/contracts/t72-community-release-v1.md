# T72 community release v1

User-authorized scope (2026-09-24): consolidate latest code to main, publish sanitized source and free personal-use Windows downloads; investigate macOS without claiming unsupported parity.

## Distribution

- Source-visible original work, not OSI open source: personal noncommercial use of unmodified software only. Modification, rebranding and commercial use require prior written permission. Root LICENSE governs only original work; upstream rights and GitHub platform rights remain intact.
- Ship the same LICENSE in NSIS and installation resources; include available third-party license texts. Do not place private profile data in source or installer.
- Preserve app identity and existing data. Fresh profile: owner name 小明; owner age/occupation/background empty; companion 小岚. Saved personal settings win over defaults.
- Do not force-push, rewrite public history, delete old branches or overwrite old worktrees as an incidental release step.

## Optional integrations

- KnowledgeOS defaults off. The visible master switch persists both independent read/sync permissions immediately; granular controls remain under advanced settings. Enabling explicitly warns about historical queued journals. Disabling cancels in-flight adapter requests, blocks new health/search/submission/receipt requests and prevents subsequent items in an active batch from running. Already sent data cannot be recalled by a local switch; preserve idempotency/receipt evidence.
- Local SQLite, Markdown summaries and long-term memories work independently of KnowledgeOS. Retention applies only to eligible raw records/audio, never to summaries/long-term memories. User-confirmed deletion remains available. Queue data is preserved when disabled, not submitted or portrayed as an active synchronization failure.
- Xiaozhi policy defaults disabled, including corrupt/missing settings and pre-initialization UI. An explicitly saved enabled policy remains enabled. Software voice/companion are independent. No hardware IO, flash or wiring is authorized by release preparation.

## Verification

Test clean profile and saved-profile compatibility, off-state zero transport, cancellation, mid-batch permission changes, local durable memories after raw expiry/reopen, exact installer contents and license presence. Test final package against production source. A successful build is not real microphone/hardware/macOS acceptance. Unsigned installers must be labeled honestly.
