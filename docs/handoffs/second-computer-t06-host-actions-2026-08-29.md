# Second-computer handoff: T06 EasyInput host actions

- `role`: development computer without hardware access
- `branch`: `codex/easyinput-t06-host-actions`
- `implementation HEAD`: `3b232f5ea3395991a15d14a18d4f1dfcabd58257`. The pushed handoff commit is the remote branch tip reported with delivery; the implementation tree is unchanged after this commit.
- `base`: T05 accepted handoff at `3dc1f5b339f5508f054fde4797cbfab638298f7f`
- `scope`: `HOST_ACTION_V1_FROZEN`; fixed text and safe UUID application actions only. T03 input/USB disconnect safety, T04 LED/GPIO8 ownership and T05 configuration transaction remain unchanged.
- `changed paths`: frozen Host Action contract; firmware host-action stream and owner integration; native Raw Input bridge; Electron main-process action boundary; renderer fixed-text/application controls; focused Host and desktop tests; `.gitignore`; provenance.
- `verification`: `npm ci --include=dev` passed; `npm test` 87/87; Visual Studio 2022/MSVC 19.44.35228.0 Host CTest 7/7; `npm run build:desktop` exit 0; `git diff --check` passed; AGENTS/CLAUDE SHA-256 values match. EIM selected ESP-IDF v5.5.5 with Python 3.11.15; target `esp32s3`, Minimal build and the fixed 16 MB partition table built successfully. The implementation-HEAD app was 329,552 bytes (`0x50750`), SHA-256 `CD1FAE599B1ABF85455F563268E5831DEC32DCDC3E29852A89F12FA955153F37`; it is verification evidence only because this documentation commit changes the embedded Git revision.
- `hardware operations`: none. Do not scan ports, identify devices, read/write Flash or NVS, flash, erase, monitor, or execute HIL.
- `open risks`: real USB Raw Input, fixed-text injection, UUID application launch, T03-T05 regression and the known `window.confirm` visual debt still require independent review/HIL on the hardware computer. The dirty-tree app hash `7C2649352CEFDC5D4B4C13054C50D5254F27852BC4F23150B24AD27E76A7E27F` is invalid for release and must not be flashed.
- `next action`: fetch and verify the exact pushed branch tip reported with delivery, audit source/provenance and frozen contract, and independently rebuild with ESP-IDF v5.5.5/esp32s3 and desktop tools. The development computer will report the final branch-tip app hash and range outside Git after one last clean rebuild; request a new explicit authorization before any app-only flash or HIL. Do not start T07.
