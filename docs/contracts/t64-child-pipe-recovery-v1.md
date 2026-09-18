# T64 child pipe recovery v1

## Problem

Electron main wrote commands to child-process stdin streams. If a child closed between the writable check and the asynchronous write, Node emitted `EPIPE` on the stream. The InputBridge and Codex App Server catalog did not own that stream error, so Electron treated it as an uncaught main-process exception and displayed a native JavaScript error dialog during launch or restart.

## Frozen behavior

- Every spawned InputBridge stdin stream has an error listener before any product command can be written.
- An InputBridge stdin failure is treated as that exact child's exit: pending bridge operations fail, public status becomes restarting, and the existing bounded backoff starts a replacement.
- Late errors from an already replaced or deliberately stopped child are consumed but cannot stop the newer child or schedule another restart.
- The one-shot Codex App Server catalog also consumes stdin errors and returns `codex-app-server-write-failed` without crashing Electron main.
- Do not add a global uncaught-exception suppressor. Unrelated programming errors must remain visible.
- Do not change device commands, hardware protocols, retained user data, renderer behavior, KnowledgeOS scheduling or firmware.

## Verification

- An InputBridge fixture emits asynchronous `write EPIPE`; the manager enters its existing restart path and launches exactly one replacement.
- A Codex App Server fixture emits asynchronous `write EPIPE`; the catalog returns a bounded failure result.
- The full desktop test/build baseline and final packaged-resource checks pass before launch.
