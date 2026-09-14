# T34D window first-paint recovery

## Report and diagnosis

After T34C was launched with the retained profile, the user observed a full white Electron window. The T34C process and main window remained alive. A controlled normal tray exit followed by diagnostic relaunch exposed the actual main page through Chrome DevTools Protocol:

- `document.readyState` was `complete`;
- the React root contained the complete workbench and retained counts;
- its rectangle was visible and non-zero;
- the packaged script and stylesheet were loaded;
- no renderer exception was recorded.

The native `BrowserWindow` used Electron's default visible/white startup state, so it could appear before the renderer supplied its first frame. No user-data reset, cache deletion or default overwrite was warranted.

## Correction

- Main window construction now uses `show: false` and the real light workbench background.
- `ready-to-show` performs the first reveal after the renderer can paint.
- Tray and second-instance restore wait for the same event only when the main frame is still loading; already loaded or minimized windows still reveal normally.
- The packaged smoke readback now queries the main-owned history SQLite service. The prior localStorage history assertion became obsolete when T32 moved persistence out of React.

## Verification and adoption

- Full Node suite: **673/673**. One preceding run had a Windows temporary-directory cleanup `EPERM`; the affected test passed alone and the complete suite then passed.
- First-paint/history targeted suite: **19/19**.
- Native bridge publish, Vite build, Windows directory packaging, exact packaged-resource check and `git diff --check`: passed.
- Packaged isolated smoke: exit 0; expected dashboard route, mock STT success, main-owned history text and clipboard output matched.
- Candidate: `release-t34d/win-unpacked/DeskMate.exe`; build ID `t34d-window-first-paint`.
- SHA256: executable `F3DDBCE13D0A27A083632D8B6EE61FF41262295ADB29915619A2D07E3D4CCC9E`; ASAR `907107117EC95506E3D7674D4A0C758B0E06D621AC773184B0FAD9154CADD1BB`.

The diagnostic T34C instance was not force-killed. Its tray state was allowed to return to “开始语音输入”, then its own Quit action was invoked. T34D is now running against the retained profile as PID 32452, window title `DeskMate · AI 工作台伙伴`, HWND 198428; a live foreground capture showed the painted workbench. No restore, retention activation, credential/configuration, cloud, hardware or firmware action occurred.

Next manual check remains the raw multi-pause dictation from the T34 acceptance sheet, comparing History raw text with the target field.
