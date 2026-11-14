# Luna Bot

[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE)

Luna Bot is a local-first desktop workspace for persistent AI teammates. It supports the local
[Codex App Server](https://learn.chatgpt.com/docs/app-server) and
[Claude Code](https://code.claude.com/docs/en/overview), plus [Grok CLI](https://docs.x.ai/build/overview)
through ACP. It gives every agent its own workspace and
conversation, and provides local queues, file transfers, an embedded browser, and agent-to-agent
messaging in one desktop app.

> [!WARNING]
> Luna Bot is a development preview. Agents currently run with `danger-full-access` and
> `approvalPolicy: never`. They can read and modify files, run commands, use the network, and control
> the embedded browser without per-action confirmations after the explicit first-launch consent.
> Run only agents and tasks you trust, keep backups, and review [Security](#security) before use.

## What works

- Persistent agents backed by independent Codex, Claude, or Grok sessions and local workspaces.
- Per-agent context monitoring with automatic compaction before long threads exhaust the model window.
- FIFO message queues with pause, resume, cancellation, and crash-safe persistence.
- Agent-to-agent messages, replies, reactions, images, and managed file transfers.
- A persistent embedded browser that agents can open, inspect, and control.
- Optional Computer Use integration for macOS through a locally installed Codex plugin.
- Per-agent model, reasoning, profile, notification, browser, and panel state.
- Local data and privacy-safe diagnostics exports.

Luna Bot is local-first, not offline-only. Codex connects to OpenAI, Claude connects to Anthropic,
Grok connects to xAI,
visited pages use the network, and installed plugins may connect to their own services.

## Install

Luna Bot supports macOS 13 or newer on Apple Silicon and Windows 10 or newer on x64 systems.

### Windows

1. Download `LunaBot-Setup-<version>.exe` from the [Releases page](https://github.com/GuilhermeFelix95/lunaBot/releases).
2. Run it. The installer does not ask for administrator rights. It installs for your Windows user and adds
   Start menu and desktop shortcuts.
3. Luna Bot checks GitHub Releases for newer versions. It installs an update only when you choose to restart.

> [!IMPORTANT]
> The Windows installer is not code-signed yet, so Windows shows "Windows protected your PC". To run it anyway,
> choose **More info**, then **Run anyway**. The warning appears because the installer has no code-signing
> certificate, so Windows cannot identify a verified publisher. Signing is not set up for this project yet.

### Build from source

macOS and Linux packages are built locally, as described in [docs/RELEASING.md](docs/RELEASING.md):

```bash
bun run dist:mac    # on macOS: unsigned ARM64 DMG and ZIP in dist/
bun run dist:win    # on Windows: unsigned x64 NSIS installer in dist/
bun run dist:linux  # on Linux: x64 AppImage and deb in dist/
```

> [!NOTE]
> Local macOS packages are not code-signed. macOS may refuse to open an unsigned app built on another machine.

### Agent setup

Luna Bot can download a supported provider runtime when you select `Download` in onboarding,
Settings, Bot setup, or the model picker. A compatible system CLI remains the first choice.

You can also install a CLI yourself.

Codex CLI on macOS:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Claude CLI on macOS:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Install Grok CLI following the [Grok Build documentation](https://docs.x.ai/build/overview), then
authenticate with `grok login` or set `XAI_API_KEY` in the environment used to launch Luna Bot.

On Windows, install the native CLI and make sure `codex`, `claude`, or `grok` is available in PowerShell.
Claude Code also requires Git for Windows. Then authenticate the installed CLI and restart Luna Bot.

Bun and Node.js are needed only to build and develop Luna Bot. Screen Recording and Accessibility
permissions are needed only for the optional Computer Use plugin.

Luna Bot uses the existing local CLI login. It does not copy provider credentials. Grok's
`XAI_API_KEY` and per-session MCP bearer tokens are never persisted or logged.

For setup problems, data reset, and uninstall instructions, see
[Troubleshooting](docs/TROUBLESHOOTING.md). Luna Bot's data and network behavior is documented in
[Privacy](PRIVACY.md).

## Development

Development requires stable [Bun](https://bun.sh/) 1.4.0, Node.js 22.12 or newer, and at least one
supported agent CLI.

Install the exact Bun version on macOS or Linux:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.4.0"
```

Install it on Windows in PowerShell:

```powershell
iex "& {$(irm https://bun.com/install.ps1)} -Version 1.4.0"
```

```bash
git clone <repository-url>
cd lunabot
bun install --frozen-lockfile
bun run codex:doctor
bun run dev
```

`codex:doctor` checks the CLI version, App Server handshake, ChatGPT login, and Computer Use plugin
without starting a model turn.

To reset only the development state, quit the dev app, then run `bun run dev:reset`.
The command deletes the development app profile and the legacy `Luna Bot Dev Host` profile,
including `lunabot.db` and its WAL files. It does not change the production profile, agent
workspaces, `~/.codex`, `~/.claude`, or `~/.grok`.

To replace only the development app profile with a durable UI showcase, quit the dev app, then run:

```bash
bun run dev:seed
bun run dev
```

The seed adds agents, rich conversations, managed files and references, reactions, completed
agent-to-agent exchanges, and routine history. It does not add live queue items or start model turns.
Use `bun run dev:seed --dry-run` to inspect the target and fixture counts without changing files.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Electron dev app with renderer HMR on its development profile. |
| `bun run preview` | Preview the built Electron app with the preview icon. |
| `bun run storybook` | Start Storybook on port 6006 for isolated component work. |
| `bun run dev:seed` | Replace only the development app profile with deterministic showcase data. |
| `bun run dev:reset` | Delete the development app profile and the legacy host profile. |
| `bun run check` | Run Biome, the UI foundation check, typechecks, the browser smoke test, the production build, and offline tests. |
| `bun run test` | Run the offline Vitest suites. |
| `bun run test:backend` | Run backend tests only. |
| `bun run test:browser` | Run the local embedded-browser smoke test. |
| `bun run test:codex` | Probe the real CLI handshake and account without starting a paid turn. |
| `bun run package` | Build an unpacked local ARM64 macOS application. |
| `bun run package:verify` | Build and verify the unpacked ARM64 macOS application, icon, metadata, ASAR, and fuses. |
| `bun run package:win` | Build an unpacked local Windows x64 application on Windows. |
| `bun run package:win:verify` | Build and verify the unpacked Windows x64 application on Windows. |
| `bun run dist:mac` | Build unsigned ARM64 DMG and ZIP files on macOS. |
| `bun run dist:win` | Build an unsigned Windows x64 NSIS installer on Windows. |
| `bun run release:patch` | Bump the patch version and move Unreleased changelog entries under it. `release:minor` and `release:major` work the same way. |
| `bun run test:filesystem` | **Online/manual:** run real full-access Codex and Claude filesystem turns across private and shared workspaces. |
| `bun run test:imagegen` | **Online/manual:** run a real full-access image-generation turn. |
| `bun run test:storage-live` | **Online/manual:** verify isolated Codex and Claude turns in a temporary SQLite database. |

The normal `check` command is offline and uses a fake App Server. Manual smoke scripts may use the
signed-in subscription and must not run in CI.

Local agents run with the providers' unrestricted execution modes. Each agent starts in its own
persistent `~/LunaBot/Bots/<agent>` workspace and also receives `~/LunaBot/Shared`; routine command
and filesystem work in both locations runs without Luna Bot adding another permission boundary.
Because these modes are intentionally unrestricted, they also permit host access outside those
directories when the provider and operating system allow it.

## Architecture

```text
Electron main
├── local Codex App Server process over stdio JSONL
├── local Claude Agent SDK session over stream JSON
├── SQLite command log and read projections
├── secure typed IPC handlers
└── sandboxed WebContentsView browser host
    ↕ typed preload bridge
SolidJS renderer
```

- `src/main` owns the Electron lifecycle, window security, local protocol, and IPC registration.
- `src/backend` owns provider adapters, persistence, message scheduling, transfers, and the browser host.
- `src/preload` exposes only the typed `window.lunabot` API.
- `src/renderer` contains the SolidJS interface.
- `packages/contracts` contains process-boundary contracts, shared limits, and pure validation.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for dependency direction, state ownership, and
rules for new modules.

## Local data and network boundaries

- `~/LunaBot/Bots/<bot-id>` — one working directory per agent.
- `~/LunaBot/Shared` — files intentionally shared between agents.
- `~/LunaBot/Shared/Transfers` — managed message snapshots and generated files. Each transfer has
  an `.lunabot-transfer.json` manifest with ownership, recipients, size, and SHA-256 metadata.
- `~/LunaBot/Downloads` — embedded-browser downloads.
- Electron `userData/lunabot.db` — the canonical Luna Bot event log and projections for agents,
  conversations, provider session bindings, queues, reactions, and attachment indexes.
- Electron `userData/legacy-backup-v1` — unchanged copies of imported `bots.json` and
  `mailbox.json` files, when these files existed before the SQLite migration.
- `~/.codex` — login and thread history managed exclusively by Codex CLI.
- `~/.claude` — login and session history managed exclusively by Claude CLI.
- `~/.grok` — login and session history managed exclusively by Grok CLI.

Deleting an agent removes its workspace, owned generated attachments, and deliveries addressed only
to that agent. A transfer remains when another agent still uses the same message.

Luna Bot keeps one stable local conversation when an agent changes between Codex, Grok, and Claude. Native
provider session identifiers stay private and are used only to resume provider runtime state.

The Electron renderer is never exposed as a public website. It communicates with local CLI processes
over stdio. The embedded browser uses a separate sandboxed Electron session and
cannot access `window.lunabot` or managed local attachments.

## Security

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Do not put credentials, private
files, conversation contents, or sensitive diagnostics in a public issue.

Full local access is an explicit current product decision, not a security boundary. Reports are
especially useful when remote content can reach Electron privileges, managed attachment paths can
escape their roots, IPC sender validation can be bypassed, or an agent can act outside the access
described above.

## Releases

Windows installers are published to GitHub Releases. The release steps, and how installed apps receive
updates, are in [docs/RELEASING.md](docs/RELEASING.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By contributing, you agree that your contribution is licensed
under Apache-2.0. Community behavior is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License and attribution

Copyright 2026 GuilhermeFelix95.

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution and third-party notices.

Luna Bot is an independent open-source project and is not affiliated with, endorsed by, or
sponsored by OpenAI. OpenAI, ChatGPT, and Codex are used only to describe compatibility with their
respective products and services.
