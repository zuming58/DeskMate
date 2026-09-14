# T40 Style Studio Image 2 V1 contract

Status: `T40_STYLE_STUDIO_IMAGE2_V1_FROZEN`

## Product result

T40 replaces the T38 Style Studio generation provider with a separately configured Image 2 service and completes the instant-camera output interaction. It preserves the T39 page shell, free material/result canvases, transient style orbit, page-scoped input lease and local managed library.

The source image remains inserted from the upper inlet. A completed generation is persisted immediately but first appears as one draggable card protruding from the machine's lower output slot. It is not shown among arranged works until the user pulls it from the slot and drops it into the lower works canvas. Reloading the page restores any persisted result in the works canvas so a successful output cannot become inaccessible.

## Image service trust boundary

- Provider profile: MetaJing-compatible HTTPS service, fixed model `gpt-image-2`.
- Default base URL: `https://metajing.cn/v1`; request endpoint resolves to `/images/generations`.
- Credentials are stored in a dedicated Windows-encrypted record. They are not reused from the Bailian voice profile or the external Yiyuan project.
- Renderer receives only configured/provider/model/base-URL status. It never receives the API key, provider response body, temporary result URL or local file path.
- Settings save accepts an HTTPS base URL without credentials, query or fragment. Loopback HTTP may be used only for an explicitly configured local test service.
- The main process creates the request from the managed source, frozen preset, bounded strength and sanitized brief. Renderer cannot choose another model or arbitrary request body.

## Request and result contract

- Method: `POST {baseUrl}/images/generations`.
- Body: fixed `model: gpt-image-2`, one prompt, one reference data URL in `images`, `size: 1024x1024`, `n: 1`, `response_format: url`, `quality: standard`, `output_format: png`.
- One request may be active. Inputs are frozen at acceptance.
- Total generation plus result-download wait is bounded to 20 minutes. The UI shows elapsed time and a truthful long-wait message.
- Cancel aborts the accepted request and download. T40 never automatically resubmits a failed or uncertain synchronous request, preventing accidental duplicate billing.
- Result may be a URL, data URL or base64 field. URL downloads must use HTTPS, must not carry embedded credentials and are limited to the existing 25 MiB/40 MP media validation boundary.
- Success is stored before the eject animation. Cancel/failure creates no result.

## Request journal

The main process keeps at most twenty sanitized request records under the Style Studio user-data directory. A record may contain local request ID, style ID, state, provider/model, start/end timestamps, elapsed milliseconds, safe provider request ID and normalized failure class. It must not contain API keys, prompts, briefs, image bytes, image URLs, filesystem paths or provider response bodies.

## Preset expansion

T40 adds `水墨微景`, `液态银蓝`, `绘本暖光` and the user-requested `果冻软糖`, bringing the frozen preset set to nine. Each preset has a main-owned prompt and an application-owned preview asset. Rotation selection continues to display the orbit only while the user is actively choosing.

## Hardware and scope boundary

T40 does not change firmware, flash, HID reports, physical key identity, VoiceWorkflow or other DeskMate routes. Existing page input lease truthfulness remains unchanged.
