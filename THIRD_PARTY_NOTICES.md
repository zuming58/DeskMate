# Third-party notices

DeskMate's root `LICENSE` applies only to original work owned by its author. It does not override third-party permissions or claim ownership of third-party code, models, notices or marks.

## Windows desktop distribution

| Component | License / notice | Use |
| --- | --- | --- |
| Electron | MIT; bundled `LICENSE.electron.txt` and `LICENSES.chromium.html` | Desktop runtime; Chromium and its dependencies have their own notices |
| React / React DOM | MIT | Bundled renderer |
| Tabler Icons React | MIT | Bundled UI icons |
| pinyin-pro | MIT | Wake-word token conversion |
| ws | MIT | WebSocket transport |
| sherpa-onnx Node addon | Apache-2.0, upstream dependency notices | Offline keyword spotting |
| sherpa-onnx WenetSpeech keyword model | Apache-2.0 per upstream metadata; `wake-model/NOTICE.md` | Offline keyword spotting weights |
| .NET 8 runtime | MIT and third-party notices | Self-contained Windows input helper |

Full available dependency license texts are included under `resources/licenses` in the installer. Electron's Chromium notices remain at the installation root. Upstream model provenance is recorded in `docs/provenance/t21g-sherpa-local-keyword-model-2026-09-08.md`; no example recordings are distributed.

## Firmware and reference projects

ESP-IDF and managed dependencies keep their original licenses. The EasyInput Maker behavior reference is identified as PolyForm Noncommercial in the provenance records; the Xiaozhi reference is identified as MIT. These external reference repositories are not bundled wholesale. File-level copied or derived material, if any, remains subject to its actual upstream license; the DeskMate license does not replace it. See `docs/provenance/` for fixed versions, hashes and adoption boundaries. The desktop installer does not flash or distribute a firmware update.

## Images, video and audio

DeskMate-generated UI samples and user-supplied generated companion clips have provenance manifests under `public/assets/style-studio` and `public/assets/companion/home-video`. They are demonstration assets, not real transformations of a new user's photo. Original DeskMate assets follow the root license where the author holds the relevant rights. User-imported photos, videos, recordings and music are not included in releases. Trademark or personality rights are not granted by a software license.

Cloud service names identify integrations only; neither service credits nor endorsement are included. A third-party API's own terms apply to requests sent to it.
