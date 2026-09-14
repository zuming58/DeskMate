# T38 Style Studio V1 contract

Status: `T38_STYLE_STUDIO_V1_FROZEN`

## Product boundary

T38 turns the accepted T37 “风格映像” screen into a software-owned image-to-image workflow without changing the DeskMate shell or any other page. It adds a managed local material/result library, a main-process Qwen Image adapter, explicit upload consent, cancellable generation, and a page-scoped EasyInput input lease.

This slice does not change or flash firmware. It does not write HID reports. It does not claim that all eight physical keys can be distinguished from an ordinary Windows keyboard with the currently deployed Maker mapping.

## Trust boundary

- The renderer never reads API keys, local media paths or provider response URLs.
- Source bytes cross IPC only after the user explicitly imports a supported image. They are stored under the Electron user-data directory with a content digest and an atomic metadata index.
- A source image is sent to Bailian only after an explicit per-generation confirmation. Opening the page, importing, selecting a style or previewing never causes a network request.
- The main process constructs the provider prompt from a frozen preset identifier, bounded strength and a sanitized optional brief. Renderer-provided arbitrary provider model names, endpoints and prompts are rejected.
- Provider output is downloaded immediately, validated and stored locally. Temporary provider URLs are not returned to the renderer or persisted.
- Errors returned to the renderer are stable, user-safe reasons; provider response bodies, keys and filesystem paths are not exposed.

## Media contract

- Source formats: PNG, JPEG and WebP, maximum 10 MiB per file, maximum 40 megapixels after renderer decode, maximum eight managed source items.
- Result formats: PNG, JPEG and WebP, maximum 25 MiB per file, maximum twenty-four managed result items. Old items are not automatically deleted in T38; the user can explicitly remove a source or result after a confirmation. A source linked by retained results cannot be removed first.
- The index contains only product metadata and SHA-256 digests. Reads re-check the digest before returning bytes.
- Re-importing identical source bytes returns the existing record instead of duplicating it.

## Generation contract

- Provider/model: Bailian OpenAI-compatible image generation using `qwen-image-3.0`.
- Input: exactly one managed source, one frozen style preset, strength 0–100 and optional brief up to 500 characters.
- The renderer sends `{ requestId, sourceId, styleId, strength, brief, consent: true }` only after the user confirms the upload dialog.
- Only one Style Studio generation may be active. Inputs are frozen when the main process accepts the job.
- Cancel aborts both generation and result download. A canceled or failed job does not create a result record.
- Success creates one local result linked to source/style/strength and returns its sanitized record plus local bytes.

## Page input lease

- The lease is valid only while the trusted main renderer is focused on `#/style-studio`.
- EasyInput board-wheel is routed to Style Studio previous/next and is not routed to Prompt Workbench during the lease.
- Existing `VoiceInput` and `VoiceEdit` trigger events are routed as Style Studio S1 and S3 commands during the lease and do not start VoiceWorkflow.
- Existing default Windows key chords are interpreted in the renderer only while the Style Studio page has focus and no editor/dialog owns the event. Leaving, hiding or blurring the window restores normal behavior.
- The lease is released on route unmount, renderer reload, window blur/close and application quit.

## User-visible truth

- Sample assets remain clearly labeled as sample assets.
- Managed user images/results are labeled as local library content.
- If Bailian is not configured, the generation action explains that configuration is required; it never substitutes a sample result.
- Hardware input status says page-scoped lease/limited mapping and never claims a firmware remap.
