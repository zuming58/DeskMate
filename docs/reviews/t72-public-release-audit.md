# T72 public release audit — 2026-09-24

## Scope and baseline

Canonical source: this repository's current product worktree, not the obsolete outer checkout or the installed application directory. Baseline `95b8dafb29a7048661bbf1e220b430f9e1a07692`, incorporating the previously uncommitted T66–T71 fixes. GitHub `zuming58/DeskMate` is already public; remote main was `3e2a046`, 392 commits behind the baseline. No prior GitHub Release was present when inspected.

## Publication boundaries

The user chose public source visibility, with personal noncommercial use only, no modification/rebranding/commercial use without permission. The root LICENSE covers original work and preserves upstream and GitHub platform rights. It cannot retroactively revoke pre-existing rights. Public code is not encrypted, and Electron ASAR is a package archive, not an anti-copy mechanism. Commercial licensing or enforcement warrants professional review.

Private profile/database, API credentials, recordings, memory content, backup snapshots and the author's presentation draft are not release inputs. Default personal name and prose were generalized; the user then chose 小明 as the empty-profile fallback. Existing installed profile is not changed. Age, occupation and background are empty by default. Public aggregate development/test counts are not a copy of the underlying private records.

## Secret scanning

Gitleaks 8.30.1 official Windows archive was downloaded with a matching upstream checksum. Initial `git --all` scan covered all locally available branch histories (509 reachable commits) and flagged three candidates. Manual triage found:

1. `electron/doubao-realtime.cjs`: published shared protocol application constant, not the user's access token.
2. Two provenance lines: public reference identifiers alongside SHA-256 values, not access credentials.

Exact historical fingerprints are documented in `.gitleaksignore`; no folder-wide exclusions were added. A staged/current-tree scan and final post-merge scan are required before push. Regex scans and selected screenshot inspection are bounded evidence, not a proof that all possible historical personal information is absent. This release does not rewrite already-public history or pretend past copies can be withdrawn.

## Branch reconciliation

104 local/remote refs were already ancestors of the current baseline. Thirteen refs pointed to earlier side histories. Some use exact cherry-picked patches; others were replaced by later accepted implementations. The latest product remains authoritative. Historical merge parents must not restore T05/T07 UI or earlier motion logic over tested current behavior.

| Side history | Current disposition/evidence |
| --- | --- |
| T37 style-studio prototype | Integrated studio promoted in `fe82db3`, followed by T38–T63; preserve current studio |
| local T15A motion presets | Patch-equivalent to integrated `871206c` |
| T07A/B/C companion prototypes | Reconciled by T07D/frozen main `3e2a046`; later real-time, memory and UI supersede prototype |
| desktop-config-read-ui-fix / T08 desktop-link-diagnostics | Old shared-config-read and layout changes; current bridge and tests retain the evolved implementation |
| T05 hardware / workbuddy T05-final | Reworked runtime gate integrated as `a3f0f5f`; do not reintroduce previous branch layout |
| T15B EasyInput bridge | Cherry-picked integration `82efa13` and later accepted versions |
| T15B Windows motion transport | Integrated `c3f0f2b`, followed by routing fix `576b159` and later versions |
| T16 desktop actions | Integrated code and handoff (`d452365`) with later notification fixes |
| T10B readiness audit | Historical hardware gate documents only; no new hardware authorization or current runtime change |

No branches or worktrees are deleted. The closure entry in flow/progress.md must state actual merge/push/tag evidence, not infer it from this plan.

## Platform and acceptance

Windows uses .NET 8 Windows Forms, user32/Raw Input and PowerShell for native input operations. macOS is not a relabeled NSIS package. Native input/hardware adapters, permissions, architecture testing and signing/notarization are not verified; no Mac installer is released as feature-complete.

T72 behavior tests cover clean/saved profile, off-state transport, cancellation, mid-batch gate, local long-term memory/Markdown after retention and reopen, and license packaging configuration. Final full suite, final-ASAR equality/native/UI probes and actual installer hashes are recorded at closure. No real paid model, microphone, reminder, hardware movement or nightly task was exercised by these tests.

## Primary references

- GitHub [repository licensing](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) and [releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
- OSI [Open Source Definition](https://opensource.org/osd): no-modification/noncommercial restrictions are not OSI open source.
- Electron [ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives) and electron-builder [platform build boundaries](https://www.electron.build/v26/docs/features/multi-platform-build/).
