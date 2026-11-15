# Changelog

All notable changes to Luna Bot are recorded here.

## [Unreleased]

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
