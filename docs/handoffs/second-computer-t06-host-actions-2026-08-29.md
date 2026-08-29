# Second-computer handoff: T06 EasyInput host actions

- `role`: development computer without hardware access
- `branch`: `codex/easyinput-t06-host-actions`
- `HEAD`: `3dc1f5b339f5508f054fde4797cbfab638298f7f` before the documentation closeout commit; update this field after commit/push.
- `base`: T05 accepted handoff at `3dc1f5b339f5508f054fde4797cbfab638298f7f`
- `scope`: `HOST_ACTION_V1_FROZEN`; fixed text and safe UUID application actions only. T03 input/USB disconnect safety, T04 LED/GPIO8 ownership and T05 configuration transaction remain unchanged.
- `changed paths`: frozen Host Action contract; firmware host-action stream and owner integration; native Raw Input bridge; Electron main-process action boundary; renderer fixed-text/application controls; focused Host and desktop tests; `.gitignore`; provenance.
- `verification`: prior dirty-tree evidence was Host CTest 7/7, `npm test` 87/87, `npm run build:desktop` exit 0, and ESP-IDF v5.5.5 target `esp32s3` build pass. A final clean-HEAD rebuild and hash must be recorded after this handoff commit.
- `hardware operations`: none. Do not scan ports, identify devices, read/write Flash or NVS, flash, erase, monitor, or execute HIL.
- `open risks`: real USB Raw Input, fixed-text injection, UUID application launch, T03-T05 regression and the known `window.confirm` visual debt still require independent review/HIL on the hardware computer. The dirty-tree app hash `7C2649352CEFDC5D4B4C13054C50D5254F27852BC4F23150B24AD27E76A7E27F` is invalid for release and must not be flashed.
- `next action`: fetch and verify the pushed branch, audit source/provenance and frozen contract, rebuild with ESP-IDF v5.5.5/esp32s3 and desktop tools, then request a new explicit authorization before any app-only flash or HIL. Do not start T07.
