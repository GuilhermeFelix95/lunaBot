# Changelog

All notable changes to Luna Bot are recorded here.

## [Unreleased]

## [0.2.9] - 2026-11-16

### Added

- Video files (.mp4, .m4v, .mov, .webm) mentioned in the conversation open in the file panel on the right, with a player.
- Room bots open files from the room's own shared folder.

### Changed

- The room's backstage has a new look: full-height panels, a list with avatar and status, and messages in cards.

### Fixed

- The room conversation no longer reloads when you return from the Backstage.

## [0.2.8] - 2026-11-16

### Added

- In the managers room you can type @ to call one manager, and only that manager answers. Without @ every manager answers.
- The managers room history is now saved and survives restarts.

### Changed

- The managers room chat is organised by rounds, with a coloured card for each manager's reply and quiet lines for what managers say to each other.
- Pinned bots now sit in their own "Pinned" section in the sidebar.
- The browser login card has Luna's own compact look, and the browser bot now finishes the task instead of stopping early.

## [0.2.7] - 2026-11-16

### Changed

- Bots are never still any more. Their faces blink, glance around and pull faces all the time, not only when you point at them, and each bot is at a different point of the loop so a list of bots does not move in unison. Reduced motion in the system settings still keeps them still.

### Fixed

- A bot in a room can now ask you to log in. Claude bots had no way to hand the browser over to you, so they stopped at the login page and could only ask you to do it yourself. The request now appears in the room, even when the bot that sent it is a member and not the manager.

## [0.2.6] - 2026-11-16

### Added

- Bots in a room show a name and a role, such as Guilherme - Manager, in the sidebar and in the backstage. The new room dialog asks for the manager's name, and every bot in a room has an Edit name and role item in its menu. Renaming a hired bot never changes the original.

### Changed

- The manager's requests in a room (hire, dismiss, create a bot) take one line each inside a slim tray that you can fold, instead of large cards that filled the screen. The explanation of each request is its tooltip.

### Fixed

- The app no longer slows down or freezes while bots work through a queue of messages. Every change in the queue used to rewrite the whole message history in the database; now only the rows that changed are written. With 1,000 messages a write dropped from about 29 ms to about 2 ms, and creating a room while a bot had ten messages queued dropped from 655 ms to about 40 ms.

## [0.2.5] - 2026-11-16

### Added

- Room managers can see the other active rooms and message the managers of those rooms to ask for work, such as a banner from a content room. Only managers talk across rooms; members still reach only their own room.
- A managers room appears in the sidebar once two rooms are active. It shows the requests the managers send each other, and one box to message every manager. Each request shows who asked whom and when.
- A manager that receives a request from another manager now answers that manager, instead of asking you questions.

### Changed

- The development app shows a DEV tag at the top of the window and is titled Luna Bot Dev, so it is never mistaken for the installed app.

### Fixed

- The rooms list in the sidebar is easier to read: the managers room has its own icon and sits apart above the rooms, and each room's members hang from a guide line under its name.
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
