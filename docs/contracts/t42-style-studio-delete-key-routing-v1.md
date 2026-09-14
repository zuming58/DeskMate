# T42 Style Studio delete and key-routing contract

Status: frozen for the T42 desktop slice. This contract does not change firmware, Flash, device configuration, or HID reports.

## Media deletion

- Materials and Works each expose one compact trash target next to their existing local action.
- A valid card drag highlights only the matching trash target. Materials cannot be dropped into the Works trash and Works cannot be dropped into the Materials trash.
- Dropping a user-managed card is the user's explicit delete gesture and removes that managed record without an additional dialog. The existing result-dialog delete action retains its confirmation step.
- The store continues to reject deletion of a source referenced by a result. UI state changes only after the main-process removal succeeds.
- Built-in samples are immutable and do not count toward user source/result limits.

## Focused-page key semantics

While the visible foreground route lease owns `#/style-studio`:

| Physical/default semantic | Studio action |
| --- | --- |
| S1 `VoiceInput` | Enter/leave strength adjustment |
| S2 `Return` | First press enlarges the current result; second press enters Reveal |
| S3 `VoiceEdit` | Save/export current result |
| S4 `Backspace` | Close/return |
| S5 `Ctrl+A` | Compare original/result or exchange Reveal inside/outside |
| S6 `Ctrl+C` | Open local inspiration prompt |
| S7 `Ctrl+V` | Reset controls without deleting media |
| S8 `Ctrl+Z` | Select Generate/Reveal mode |
| source-identified `F22` | Confirm/generate |

S2's `Return` is consumed at the page level even when a button owns focus, so it cannot accidentally click a focused control. The lease releases on route leave, blur, navigation, reload, renderer loss, window close, or application quit; normal voice behavior then resumes.

## Encoder-press boundary

EasyInput V2.0 has a physical encoder press input on GPIO18. Hardware existence is not the same as a host event. DeskMate's current default encoder press action is `scroll_axis_toggle`; that operation is handled inside the keyboard and produces no distinguishable Windows event. A renderer-only change therefore cannot observe that default press.

T42 recognizes a source-identified, host-visible `F22` as confirm if the installed mapping already emits it, but T42 does not rewrite the board mapping. Any future temporary remap must use the existing preview/confirm/readback configuration flow and requires separate user authorization before the device is written.

## Verification boundary

Automated verification covers DOM Return routing, route-scoped S1/F22/S3 events, both trash targets, successful managed-result removal, sample protection, responsive layout, exact packaged bytes, and lease release. Physical encoder acceptance remains pending a host-visible event and a real board test.
