# T19 Windows application and local music closure

## Goal

Close two visible Windows-only gaps: make voice-enabled application registration discoverable and deterministic, and synchronize one user-selected local song with accepted dance execution.

## Acceptance

- The user can find “智能控制”, search for 网易云音乐 (or choose its local shortcut), register it and explicitly enable voice launch in one flow.
- “打开网易云音乐” launches exactly that enabled registration without a language-model decision. Disabled, missing, negated and ambiguous targets fail closed.
- The motion page can select, replace, enable, preview and stop one local audio file without exposing its full path to React.
- Built-in dance, activated custom dance and voice dance start the selected track; normal completion, stop and emergency stop end it.
- “播放音乐” and “停止音乐” control the same selected local file. Xiaozhi firmware is unchanged.

## Out of scope

- Streaming-service search, account control, playlists or automated song choice.
- Generative singing, Xiaozhi/EasyInput speaker output or a new audio protocol.
- Hardware expansion, face tracking, speaker/person recognition and non-Codex Agents.
