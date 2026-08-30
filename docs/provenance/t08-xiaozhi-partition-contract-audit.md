# T08 Xiaozhi 16 MiB partition contract audit

Status: `SOURCE_VERIFIED / PRODUCT_COPY_BYTE_IDENTICAL / BUILD_USE_CONFIRMED / HARDWARE_NOT_AUTHORIZED`

## Source identity

- Read-only source: `F:\Codex\xiaozhi-yuntai\partitions\v1\16m.csv`.
- Source size: 329 bytes.
- Source SHA-256: `5F9FA5E46E092D5571D19DA7B8956F6F9BFD5B7F603799B24D8DFCE769E30C14`.
- Reference root: `F:\Codex\xiaozhi-yuntai`; exact Git commit `UNKNOWN` because the local reference has no `.git`.
- Reference project version: `1.9.0`.
- Reference root license: MIT; license SHA-256 `0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05`.

## Product adoption

- Product path: `firmware/xiaozhi-yuntai/partitions/v1/16m.csv`.
- Product size and SHA-256: 329 bytes, `5F9FA5E46E092D5571D19DA7B8956F6F9BFD5B7F603799B24D8DFCE769E30C14`.
- Modification: none; the partition source is byte-identical. ESP-IDF selection, fail-closed CMake validation and Host assertions are DeskMate additions outside the copied CSV.

| Name | Type/subtype | Offset | Size |
| --- | --- | ---: | ---: |
| `nvs` | data/nvs | `0x9000` | `0x4000` |
| `otadata` | data/ota | `0xD000` | `0x2000` |
| `phy_init` | data/phy | `0xF000` | `0x1000` |
| `model` | data/spiffs | `0x10000` | `0xF0000` |
| `ota_0` | app/ota_0 | `0x100000` | `0x600000` |
| `ota_1` | app/ota_1 | `0x700000` | `0x600000` |

`sdkconfig.defaults` selects this custom table, and the root CMake stops configuration if a different file is selected. Host tests lock the six rows. The clean ESP-IDF build must independently prove `app-flash_args` uses `0x100000` and the app image is smaller than `0x600000`.

No reference or product build artifact was copied or committed. This source adoption does not authorize Flash access, flash, erase, monitor or device identification.
