# T21J dialogue continuity, wake acknowledgement and memory retrieval

Status: `T21J_DIALOGUE_MEMORY_CONTINUITY_V1_FROZEN`

Windows-only amendment to the T21 context and T15E projection boundaries. ASR,
Doubao caller-text speech, wake recognition, endpointing, noise rejection, motion
and both firmware images remain unchanged.

## Evidence and behavior differences

The submitted diagnostic identifies `t21i-barge-final-recovery` and explicitly
reports `pipeline.provider=three-stage`. It also records successful keyword hits.
It contains no request bodies and cannot by itself prove which story was lost.
Local source comparison establishes these concrete differences:

| Boundary | Previous implementation | T21J |
| --- | --- | --- |
| Wake | Starts capture silently | One fixed owner-aware acknowledgement through existing Doubao TTS, then listening |
| Short context owner | Private model adapter array, cleared on close | Electron-owned bounded dialogue independent of audio/provider lifetime |
| Length | 12 messages, effectively 6 exchanges | 80 messages / 32,000 content characters from the last 24 hours |
| Provider replacement | New empty history after trusted answer/reconnect/rewake | Same main-owned context including deterministic trusted turns |
| Interrupted stream | Incomplete model answer absent from model history | In-memory generated prefix marked interrupted; never presented as fully heard |
| App restart | Empty model history | Seed only recent persisted companion finals; no dictation raw text |
| Earlier same-day topics | Not attached | Bounded relevant recent companion excerpts retrieved locally beyond rolling context |
| Long-term recall | Recent accepted snapshot once on session start | Vector + keyword search on every ordinary companion model request |
| Manual digest | One batch per source/day, date filter after LIMIT | Date filtering before LIMIT, bounded repeated batches across pending dates |
| Corrected vectors | Chunk candidate/ordinal uniqueness failure | Remove superseded chunk IDs before inserting updated chunks transactionally |
| Markdown without directory | No projection | Default application-local knowledge-base folder; external root remains optional |

## Dialogue and retrieval

- Listening may close after the existing ten-second idle timeout. Closing audio is
  not a memory reset. All existing final turns stay in SQLite until explicit forget.
- Model requests include at most 80 recent user/assistant messages and 32,000
  content characters. Older material is **not deleted** when it leaves the prompt.
  Up to six relevant earlier hits plus adjacent turn context (12 excerpts of at
  most 700 characters) can be retrieved from companion records in the last 24 hours.
- The current user sentence is supplied once. Reconnecting does not replay audio
  or resubmit a previous user request. Aborted/stale model deltas cannot repopulate
  cleared context or change the next answer's history.
- Generated interrupted prefixes are memory-only, explicitly labelled as possibly
  unheard. SQLite remains a finals-only record; restarting the process does not
  claim to reconstruct the precise audible interruption point.
- Each ordinary companion request refreshes the reviewed index as necessary and
  uses the existing `deskmate-local-hash-embedding-v1` (256 dimensions) plus keyword
  ranking, capped at eight relevant chunks and four recent memories, deduplicated
  and capped to 4,000 characters. This is real local vector retrieval, **not a
  neural semantic embedding service**; retrieval quality still needs user testing.
- Only accepted memory from either `companion` or `dictation` enters long-term
  recall. Daily summaries and pending/rejected candidates do not become approved
  facts. Recent raw companion excerpts are separately labelled dialogue evidence.
- Normal dictation is unchanged and never invokes companion recall to rewrite its
  output. No external documents are scanned. Future user-selected knowledge-base
  document ingestion is a separate, not-yet-implemented scope.
- Memory correction refreshes the index on the next question. Confirmed forget
  clears active context, ends the foreground answer and synchronizes managed notes;
  externally modified note conflicts are retained and reported.
- Prompts explain the actual three-stage architecture when explicitly asked and
  disallow claiming that realtime voice inherently has no context or microphone.
  Available history is evidence, not an instruction granting actions or authority.

## Wake acknowledgement

- A successful idle local keyword hit calls the existing start route with an
  internal greeting flag. Main builds `在呢，<ownerName>。` from the saved persona.
- One direct speech request uses normal conversation volume, not Codex alert volume.
  It does not call the text model, create a fake user turn, or greet again on transport
  retries or deterministic tool replies. Existing wake debounce remains in force.
- After greeting playback drain, the same session listens. Task notifications
  retain their one-shot close-after-playback behavior.

## Manual daily notes

- Raw final events are already durable in the application SQLite file, independent
  of whether the app stays open all day. No new loose raw-text copies are created.
- `整理待处理记录` processes enabled sources by their original local date, at most
  64 batches per click, 120 turns / approximately 24,000 input characters per batch.
  Remaining days are reported; another click resumes. Duplicate clicks are rejected.
- The text model merges the previous daily summary with new records. Output keeps
  key topics, work, decisions and todos, omitting irrelevant chatter and repetition.
  Original SQLite turns are unchanged. Candidates remain pending for user review.
- Successful earlier batches remain committed and projected if a later batch fails.
  Retry works from still-unprocessed rows without repeating completed work.
- Default notes go under `<userData>/knowledge-base/DeskMate/daily/<source>/YYYY-MM-DD.md`.
  An explicitly selected external root changes only subsequent projection target;
  existing user notes and the internal source database are not moved or deleted.
- `打开笔记文件夹` opens only the main-owned configured/default root. Renderer cannot
  supply a path. Complete paths and credentials never cross this IPC.
- Files not previously owned by the projection manifest, or modified externally,
  cannot be overwritten. Manifest traversal paths are rejected. Knowledge-base
  folders are never recursively scanned for other documents.

## Verification and acceptance

Synthetic tests cover provider replacement with the real controller, hours idle,
more than six topic changes, abort/late deltas, cold restart, context bounds and
forget, reviewed retrieval/correction/deletion, greeting-to-listening, multi-day
backlogs larger than 120 turns, failed-run retry, unmanaged-file conflicts and
content-free diagnostics. No user's actual speech or memories are test fixtures.

User-present gates: hear one wake acknowledgement; tell a story, change topics,
end listening and re-wake to continue it; approve one harmless memory and query it
in a later session; manually digest outstanding days and inspect the dated notes.
Package/test success is not a claim of real acoustic or model-quality acceptance.
