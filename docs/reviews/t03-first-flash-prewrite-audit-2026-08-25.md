# T03 first-flash pre-write audit

Status: `COMPLETED_FLASH_VERIFIED_PENDING_NORMAL_BOOT_HIL`

## Scope and authorization

The user authorized only the current EasyInput V2.0 first-flash card: identify one target, preserve and verify Flash/NVS, show the exact write plan, then flash and run T03 HIL. Erase-all, partition migration, eFuse, Xiaozhi, network scanning and unrelated device access remain forbidden.

The pre-write audit originally stopped before any write. After the user separately confirmed the exact final manifest, the audited images were written as recorded in the execution result below.

## Recovery evidence

- Target class: ESP32-S3, 16 MB Flash; the private unique identity is stored only in the Git-external recovery directory.
- Full Flash/NVS backup: 16,777,216 bytes.
- Full backup SHA-256: `51B0ECAD795E077FCB8F3964459733CA817FD68B4ACDD755E136549C5CE8C991`.
- Backup length, readability and repeated SHA-256 verification passed.
- Current NVS is separately extractable at `0x9000..0xEFFF`; its content and identity are not stored in Git.

## Blocking mismatch and correction

The original T03 minimal build used the ESP-IDF default table:

```text
nvs       0x9000    0x6000
phy_init  0xF000    0x1000
factory   0x10000   0x100000
```

The board backup and pinned Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01:partitions.csv` both use:

```text
nvs       0x9000    0x6000
phy_init  0xF000    0x1000
factory   0x10000   0x300000
sound_a   0x310000  0x90000
sound_b   0x3A0000  0x90000
```

The mismatch stopped the write gate. Commit `2d2f867dba95835f19af35cd0fd872b96748c2db` adds the canonical product `partitions.csv`, selects it in `sdkconfig.defaults`, rejects drift in CMake, and locks the exact normalized entries in Host tests. It does not implement or access NVS or sound storage.

## Verification

- Host CTest: 3/3 passed, including the partition/source contract vector.
- ESP-IDF: exact 5.5.5, target `esp32s3`, isolated generated sdkconfig, clean committed source.
- App: `0x36610` bytes; 3 MiB factory partition has `0x2C99F0` bytes (93%) free.
- Bootloader: `0x5160` bytes; space before `0x8000` remains `0x2EA0` bytes.
- Final partition table: 3,072 bytes, SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`; byte-identical to the board backup.
- `git diff --check`, ASCII paths, local AGENTS/CLAUDE identity, secret scan and EasyInput board declaration scan passed. The board scanner retained one known `constexpr` pin-declaration WARN and zero failures; input GPIO declarations were unchanged.

## Exact planned writes

| Range | Bytes | Image SHA-256 |
| --- | ---: | --- |
| `0x000000..0x00515F` | 20,832 | `AA0E95CF9343CD7B7ACF65D4CFBE90BE7430AC3EC39F104CB81E24A53F864A42` |
| `0x008000..0x008BFF` | 3,072 | `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278` |
| `0x010000..0x04660F` | 222,736 | `68AAFEA9A2A644A60437EC21079294ABDB59B6539BC031D21703818B71755DBF` |

The plan preserves `0x9000..0xFFFF` NVS/PHY and all content from `0x310000` onward, including both sound banks. Before writing, the hardware computer must freshly revalidate the same private identity after any USB reset or re-enumeration.

## Next gate

The user gave the final confirmation. The same private ESP32-S3 identity was verified before and after writing only the three listed ranges; esptool reported data-hash verification for all three. No erase-all, eFuse, NVS/PHY, sound-bank or Xiaozhi operation occurred.

The board is still in the manually entered download mode. Perform the EasyInput-specific normal-boot recovery (`power off → wait 2–3 seconds → power on`, never press BOOT again), then verify `VID 303A / PID 1006` and run the complete T03 HIL matrix. T04 remains closed until HIL passes.
