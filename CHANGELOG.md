# Changelog

All notable changes to Luna Bot are recorded here.

## [Unreleased]

### Added

- Room managers can see the other active rooms and message the managers of those rooms to ask for work, such as a banner from a content room. Only managers talk across rooms; members still reach only their own room.

### Changed

- The development app shows a DEV tag at the top of the window and is titled Luna Bot Dev, so it is never mistaken for the installed app.

### Fixed

- Running the development version no longer replaces the installed app's Start menu shortcut, so an update opens Luna Bot instead of a blank Electron window. The development copy of Electron now carries the name Luna Bot Dev in its file properties.
- Bots in a room show the same mascot in the sidebar and the backstage as in the conversation, instead of a different one.

## [0.2.4] - 2026-11-16

### Changed

- Bots in a room's sidebar no longer carry a "copy" label.

### Fixed

- Turns that had already finished no longer go back to "running" in the stored history, and turns left running by a restart are closed when the app opens.
- The line under your message that says the agent is working keeps the same text and animation until the reply ends, instead of changing when the reply moves from the queue to its turn.

## [0.2.3] - 2026-11-15

### Changed

- New agent mascots. Thirty of them replace the old shapes: objects such as an envelope, a magnifying glass and a book,
  creatures, robots and symbols such as a heart or a lightning bolt. Each has its own face and, while its agent works,
  its own small movement. Agents keep their colour and get a new mascot from their seed; the picker in the agent settings
  still offers a new set of twelve and a colour.

### Fixed

- After an update the app opens as Luna Bot, not as a blank Electron window. Development runs now use their own name, so
  their notification shortcut can no longer replace the installed app's Start menu shortcut.

## [0.2.2] - 2026-11-15

### Fixed

- The chat keeps following the latest message while long messages and replies arrive, instead of stopping partway down.
- A bot no longer freezes the whole app (the main process at full CPU) when a message waits behind a turn that already
  finished. The queue resumes by itself.
- The taskbar shows the Luna Bot icon on Windows even when the development version of the app has run on the same computer.

## [0.2.1] - 2026-11-15

### Added

- Agent replies appear as cards with the agent's avatar, name and time.
- Folders and absolute paths written in a message are links. A file opens in the side panel where the browser sits, and
  a folder opens a list you can move through, with a button to go up.
- Backstage in a room shows one conversation per member in two columns, with Markdown, keyboard navigation and a
  single-column layout in narrow windows.

### Changed

- Claude conversations compact on their own near 200k tokens (you can change the window in the settings), and the app now
  reads the real token usage of each model call.

### Fixed

- The chat keeps following the latest message while a reply streams, and stops when you scroll away.
- A collapsed sidebar can be expanded again.
- A very long result passed between agents no longer leaves the receiving agent stuck, and an unanswered question, a slow
  model switch or a slow provider start no longer block the queue forever.

## [0.2.0] - 2026-11-15

### Added

- Rooms. Create a room next to Create bot, name it, and pick which of your bots join. Each room has its own manager,
  and every bot in it is an isolated copy with its own memory, files and workspace. The manager can look up only the
  name and role of your other bots, and asks for your approval before hiring one. When a bot does not exist yet, the
  manager asks you to create it. A room can use its own browser profile or the shared one.
- Room conversations: talk only to the manager in the Conversation tab, and follow what the manager and the bots say to
  each other, read only, in the Backstage tab.
- Room lifecycle: dismiss a bot and keep its history, archive a room, reopen it, or delete it for good from the archive.
- A strip above the composer and an animated marker in the sidebar show when an agent is working in the background.
- The result of background work now comes back to the conversation. Before, it was dropped when the original turn ended,
  and a note appears if the app restarted while a task was still running.

### Changed

- On Windows and Linux a downloaded update installs when the app quits, so closing the app or shutting the computer
  down no longer leaves you on the old version.

### Fixed

- Choosing a model in a room now takes effect, and a new room starts with a provider that is available.
- Long replies in a room no longer push the message box off the screen; the conversation follows the latest message.

## [0.1.2] - 2026-11-14

### Fixed

- Bot faces show their eyes and mouth again in the installed app. A build step had given every avatar mask the same
  id, so the cut-outs were ignored.

## [0.1.1] - 2026-11-14

### Fixed

- The menu bar is hidden on Windows and Linux. Keyboard shortcuts keep working.

## [0.1.0] - 2026-11-14

First public release. Luna Bot is a development preview.

### Added

- Persistent AI agents backed by independent Codex, Claude, or Grok sessions, each with its own local workspace
  and conversation.
- Per-agent context monitoring with automatic compaction, and per-agent model, reasoning, profile, notification,
  browser, and panel settings.
- FIFO message queues with pause, resume, cancellation, and crash-safe persistence.
- Agent-to-agent messages, replies, reactions, images, and managed file transfers.
- A persistent embedded browser that agents can open, inspect, and control.
- Local diagnostics exports with privacy-safe content.
- Windows x64 installer, with updates checked against GitHub Releases.

### Known limitations

- Agents run with full local access (`danger-full-access`) and without per-action approval. See
  [README](README.md#security).
- Installers are not code-signed, so Windows SmartScreen warns on first run.
