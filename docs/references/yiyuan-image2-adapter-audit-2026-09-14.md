# Yiyuan Image 2 adapter audit — 2026-09-14

## Source and boundary

- Read-only source: `F:/Codex/yiyuan-content-platform`.
- Git branch/HEAD at inspection: `main` / `85f84cda38332e8e34b6198547cb1f960d330460`.
- The source worktree was dirty. The relevant current files were inspected without editing them:
  - `src/lib/imageGeneration.ts`, SHA-256 `067F939B39C0C98F383FE8B4A60BA94518763E145D64D475F2B6FC251158A381`.
  - `src/infrastructure/localSettings.ts`, SHA-256 `506C951A99B2D5AD3A3FB8052F9A80D40ED6D6192DAAF37E26471ECE154CDEC6`.
- The project is marked `private: true` and has no repository license file. No source code, credential, configuration file, user image, generated image or binary is copied into DeskMate. This audit records behavior only; DeskMate implements its own adapter and encrypted store.
- The ignored local configuration was queried only for non-secret fields. Observed profile: provider `qingyan`, base URL `https://metajing.cn/v1`, model `gpt-image-2`, resolution `1k`, credential present. The key value was not printed or transferred.

## Observed fixed behavior

| Concern | Yiyuan current behavior | DeskMate T38/T39 before T40 | DeskMate T40 decision |
|---|---|---|---|
| Provider contract | MetaJing OpenAI-compatible `POST /v1/images/generations` | Bailian compatible endpoint | Separate encrypted Image 2 profile; fixed MetaJing-compatible endpoint and `gpt-image-2` model |
| Reference image | `images: [data:image/...;base64,...]` | single `image` data URL | use the Image 2 `images` array |
| Output | `response_format: url`, PNG, then bounded download | URL then bounded download | same response shape, HTTPS-only result URL, bounded verified download |
| Request shape | one output, `quality: standard`, requested square size | one output, `size: auto` | one output, 1024×1024, standard quality, PNG |
| Timeout | local runtime effectively has no total timeout | 600 seconds | bounded 20-minute total wait with explicit elapsed UI and cancellation |
| Retry | synchronous MetaJing submission is not automatically retried when the outcome is uncertain | no automatic retry | no automatic retry; prevent double billing after an uncertain submission |
| Persistence | project job framework persists generation state | only successful Style Studio result persists | keep successful result persistence and add a sanitized 20-item request journal |

## Explicitly not reused

- Yiyuan project storage, account model, prompts, UI, logs and settings file.
- The Yiyuan API key or any other secret.
- Any direct import or runtime dependency on the external project.

