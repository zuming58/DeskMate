# T19 local application and media contract v1

Status: `T19_LOCAL_APP_MEDIA_V1_FROZEN`

## Application launch

- Allowed targets remain Electron-registered local `.exe` or `.lnk` entries with UUID identifiers.
- Voice execution additionally requires the persisted `voiceEnabled=true` policy for that UUID.
- A launch utterance must contain a launch verb and exactly one longest registered display label after NFKC/case/punctuation normalization.
- Negation, equal-strength ambiguity, missing files, shortcut arguments, paths, URLs and Shell input fail closed.
- The renderer sees only UUID, display label and policy; it never receives a target path.

## Local dance music

- Accepted extensions: MP3, WAV, M4A, AAC, FLAC and OGG; maximum file size is 32 MiB.
- Electron stores the selected path only as Windows `safeStorage` ciphertext. The renderer receives only display label, MIME type and the bounded bytes when playback is requested.
- One playback generation may exist. New playback supersedes old playback. Normal dance completion, user stop and emergency stop all issue a stop command.
- Music is optional and disabled when no valid file is selected. It does not affect motion success evidence.
- This is a Windows computer-speaker feature. It changes no Host HID, DeskMate Link, firmware, PWM, GPIO or servo contract.
