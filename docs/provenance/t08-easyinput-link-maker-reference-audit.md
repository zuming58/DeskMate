# T08 EasyInput Link Maker reference audit

## Fixed source

- Reference repository: `F:\Codex\easyinput-wzm\easy-input-maker`
- Fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- Access: read-only `git show` / `git grep`; the reference working tree and build outputs were not consumed.
- Product destination: DeskMate-owned implementation under `firmware/easyinput-controller/`.

## Relevant comparison

| Concern | Fixed Maker behavior | DeskMate T08 decision |
| --- | --- | --- |
| J4 UART | No DeskMate board-to-board UART owner exists. | Add a single UART0 owner on GPIO43/44. |
| Console/logging | `sdkconfig.defaults` does not release UART0 and the application uses ESP logging. | Disable application/bootloader consoles and logs before assigning UART0 to Link. |
| Ownership | USB, input and persistence work have explicit owners and bounded queues/state. | Reuse the ownership pattern: one Link task owns all UART reads, parsing and writes. |
| Framing/tests | No DeskMate Link framing or compatible vectors exist. | Implement the frozen v1 contract and language-neutral vectors in this repository. |
| Product behavior | Maker implements a broader keyboard product including BLE/audio/power behavior. | Preserve T03–T06 DeskMate behavior and do not import unrelated Maker subsystems. |

## Derivation and license boundary

No Maker source file is copied. T08 is a clean DeskMate implementation based on the frozen product contract, board evidence, ESP-IDF UART APIs, and the structural lesson that each transport has one owner and bounded state. The reference commit remains provenance evidence rather than a build dependency.
