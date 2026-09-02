# T15E motion UX and shared-memory Windows handoff

Date: 2026-09-03

## Exact delivery

- Branch: `codex/t15e-motion-memory-ux`
- Start baseline: `79ed688044c34860819e99b4681cc1280ed3039b`
- Motion HID routing repair: `576b159`
- Compact motion and choreography UX: `c8de587`
- Shared long-term memory implementation: `66d330e`
- Per-source schedule status repair: `b7e2334`
- Final HEAD: the documentation commit containing this handoff

## Delivered Windows scope

### Motion transport routing

- T15 preset feature/input reports `0x18/0x19` resolve the dedicated vendor collection `FF00:0009`.
- Configuration and manual-motion report routing retain their existing collections.
- Native and JavaScript tests prove the collection split and failure behavior.
- No HID report was sent and no hardware was accessed during this package.

### Compact motion experience

- The fixed-motion start, stop-and-center and emergency-stop actions share one compact 40 px row.
- The primary action no longer stretches across the card.
- Default repeats are summarized inline instead of occupying a notice panel.
- Software-preview and automatic-motion boundaries remain visible as short captions.
- The choreography editor uses compact track selectors and a wrapping action bar; it does not add a duplicate large face preview.
- The user screenshot and implementation capture were inspected together at the same `1440 × 1024` target. `design-qa.md` records `final result: passed`.

### Shared long-term memory

- The store accepts exactly two independent sources: final companion turns and successful real voice-input dictation.
- Voice edit, mock STT, failed/cancelled/empty transcription, raw audio and credentials do not enter memory.
- Legacy rows migrate to `companion` without deleting their text.
- Daily summaries use `(source, local_day)` identity. Digest runs use source, local day and a digest of stable ordered input, so repeating a run cannot duplicate work.
- Both sources default enabled and can be disabled independently, including both off. Daily processing defaults to local 23:30 and performs bounded startup catch-up.
- Each source has an independent last result and retry path. Empty source-days do not invoke the model.
- Knowledge projection writes separate managed notes under `DeskMate/daily/<source>/YYYY-MM-DD.md`; reviewed memories link to the matching source-day note.
- The memory page exposes compact source toggles, daily/manual scheduling, next-run time, per-source last results and source filters.

The frozen behavior is documented in `docs/contracts/t15e-shared-memory-ingestion-v1.md`; stable product policy is `flow/decisions.md` D079.

## Verification

- Full `npm test`: `370/370` passed.
- `npm run build:desktop`: passed.
- Packaged native input bridge `--protocol-self-test`: exit `0`.
- `git diff --check`: passed.
- Tracked path, secret-assignment and generated-artifact scans: passed.
- `firmware/easyinput-controller` and `firmware/xiaozhi-yuntai`: no diff from `79ed688044c34860819e99b4681cc1280ed3039b`.

Package evidence:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `ABC078FD3049F3F288F38DD4EEF1CD5BBAC3BA491EBC386406547DED280A26CD` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153516937 | `0A79E18DC3C023983619BEECFC998C6AA42038F9A629FB0CB6E3FD2592E4ABA8` |
| `resources/app.asar` | 112953228 | `922D872F8F491B60339B6F8FB5A51B5427028BEF4CAEDC3B2BF10A33F58B6743` |

## Unclosed gates

- The package has code, build and simulated evidence only. It does not claim physical motion or long-running real-model memory acceptance.
- The Main Agent must review and integrate the branch before it becomes the unique product baseline.
- T15 preset HIL and any later choreography wire remain separate user-present gates.
- Memory real-world acceptance should cover one companion day, one dictation day, a missed scheduled run, one per-source failure/retry and knowledge-base projection conflict handling.

No application was launched or controlled. No port, device, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred.
