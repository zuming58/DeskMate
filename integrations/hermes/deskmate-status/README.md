# DeskMate status plugin for Hermes

This optional plugin maps official Hermes lifecycle hooks to DeskMate's existing seven-state Agent channel. It is not installed or enabled automatically.

## Privacy boundary

The plugin sends only:

- protocol version;
- provider `hermes`;
- an allowlisted lifecycle event name;
- a bounded tool name when the event is a tool call;
- the closed final outcome `completed`, `failed`, `interrupted`, or empty.

It does not send prompts, replies, commands, descriptions, tool arguments or results, paths, session/task/turn IDs, provider/model names, error messages, or user content.

## User-controlled activation

Hermes documents user plugins under `~/.hermes/plugins/` and requires explicit enablement. When the user is ready to run a real acceptance test:

1. Review this directory.
2. Copy the entire `deskmate-status` directory to `~/.hermes/plugins/deskmate-status/`.
3. Enable `deskmate-status` through Hermes' plugin management UI or CLI.
4. Restart Hermes and select `Hermes` with automatic status enabled in DeskMate.

Do not replace the repository copy with a symlink into user configuration. Project-local Hermes plugins are not enabled by this package.

If DeskMate is closed, the bounded background sender drops the event silently. It never queues events for replay.
