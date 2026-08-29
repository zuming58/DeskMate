# T06 Host Action acceptance (2026-08-29)

## Accepted configuration

- Branch: `codex/easyinput-t06-host-actions`.
- Desktop source tested: `1fb0dab99697209f70927442aa3aaf78fd45ecbc` before this evidence-only documentation commit.
- Board firmware source: `7907d6f8412e549fc312eed23deeb31ba5dcda53`.
- Board app at the authorized flash: 327,952 bytes (`0x50110`), SHA-256 `8CDAF8B2786D26DF1253E68E7A3EC1A1987199551CB8C7DFC454C090EF09BAE6`, app-only range `0x010000..0x06010F`.
- Source comparison: `git diff 7907d6f..1fb0dab -- firmware/easyinput-controller` is empty. The later desktop fixes and audit documentation did not change the firmware executing on the board.

## User-observed matrix

On 2026-08-29 the user launched the newly built DeskMate package and reported all requested checks passed:

1. Voice input wrote directly into the original target window.
2. Intentional target-window change failed closed and used the clipboard fallback.
3. A configured fixed-text key saved and triggered correctly.
4. A configured application action opened only the selected application.
5. DeskMate restart retained readable keyboard configuration.
6. Eight keys, encoder scrolling/press, LED feedback and the voice key passed regression.

This is user-observed HIL evidence. It does not include serial monitor logs, Flash/NVS reads, destructive recovery or an additional firmware write.

## Automated evidence inherited by the accepted package

- Desktop `npm test`: 101/101.
- Desktop `npm run build:desktop`: exit 0.
- Firmware Host CTest: 7/7.
- Exact ESP-IDF v5.5.5 / esp32s3 / Minimal Build with the fixed 16 MB partition table: passed.
- T02-T06 combined source audit: no automated blocker; see `docs/reviews/t06-host-actions-combined-self-audit-2026-08-29.md`.

## Result

`SELF_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HOST_ACTION_V1_FROZEN / HIL_CONFIRMED / USER_ACCEPTED / T06_LOCKED`

No generated desktop package or firmware binary is committed. The next computer must fetch the branch and rebuild from source. This acceptance does not authorize T07 or any future hardware operation.
