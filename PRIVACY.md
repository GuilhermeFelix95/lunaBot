# Privacy

Luna Bot is a local desktop app. It has no account, no Luna Bot server, no remote team service,
no sync, and no remote access. Agents, conversations, attachments, browser data, and settings are
stored on the computer that runs Luna Bot.

Luna Bot connects to the AI provider you choose (Codex, Claude, or Grok) and to a few download
sources described below. It does not send your conversations to a Luna Bot server.

## Data stored on your computer

Luna Bot stores its data in two places.

**Luna Bot folder** in your home folder (`~/Luna Bot` on macOS, `%USERPROFILE%\Luna Bot` on Windows):

- `Bots/` contains one workspace per agent.
- `Shared/` contains managed transfers shared between agents.
- `Downloads/` contains files downloaded by the embedded browser.

**Luna Bot data folder**, the application user-data folder for packaged builds (`~/Library/Application Support/Luna Bot`
on macOS, `%APPDATA%\Luna Bot` on Windows). Development builds from `bun run dev` use the `Luna Bot Dev` folder in
the same parent folder instead:

- `lunabot.db`, the SQLite database with agent metadata, conversations, message queues, and related
  app state.
- Managed copies of attachments that you add to Luna Bot. They remain there after the original file
  is moved or deleted.
- Embedded browser data (cookies, logins, and site storage), stored as an Electron session partition
  named `persist:lunabot-browser`. All agents share this browser profile.
- Preference and state files: first-run setup, update preference, window and sidebar layout, and
  browser state.
- `provider-runtimes/`, the provider CLI runtimes that Luna Bot downloads when you install them.
- `runtimes/whisper/`, the local voice transcription model, when voice is prepared.
- `logs/update/`, update logs.

**Provider CLI folders** are owned by each provider's CLI:

- `~/.codex` is owned by the Codex CLI and contains its login and thread data.
- `~/.claude` is owned by the Claude CLI and contains its login and session data.

Luna Bot does not copy or manage Codex or Claude credentials.

## Network connections

Luna Bot makes these network connections. Nothing else is sent to a Luna Bot server.

- **Codex:** the local Codex App Server connects to OpenAI when you use Codex. Account usage shown in
  Luna Bot is requested through this same local App Server.
- **Claude:** the Claude Agent SDK, through the local Claude CLI, connects to Anthropic when you use
  Claude.
- **Grok:** Luna Bot starts the local Grok CLI and communicates with it over stdio. The code contains no xAI API
  address; any network use is made by the Grok CLI itself.
- **Provider downloads:** when you install a provider, Luna Bot downloads its runtime from the source pinned in
  `native-runtime.lock.json`: the Codex release assets on GitHub (`github.com/openai/codex`), the Claude package
  from the npm registry (`registry.npmjs.org`), and the Grok CLI from `x.ai/cli`. Each downloaded file is checked
  against a SHA-256 hash. Grok license and notice files are fetched from `raw.githubusercontent.com`.
- **Voice model:** when voice transcription is prepared, Luna Bot downloads the Whisper model file
  from Hugging Face and checks it against a SHA-256 hash. Voice transcription itself runs locally with
  `whisper-cli`; audio is not sent to a remote transcription service by Luna Bot.
- **Embedded browser:** pages you or an agent open load from their own websites. The browser starts
  on `https://www.google.com`.
- **Updates:** packaged Windows and macOS builds check GitHub Releases for new versions with `electron-updater`,
  about 12 seconds after launch and then every four hours. Development runs and Linux packages do not check. Downloads
  follow your update preference, and an update is installed only when you choose to restart. GitHub receives the usual
  request metadata, such as your IP address (see `docs/RELEASING.md`).
- **External links:** links such as the Claude documentation open in your default browser only when
  you click them.

Luna Bot does not include usage analytics or telemetry in its code.

## Agent access

Agents run with Codex in `danger-full-access` sandbox mode, and Codex is configured with
`approvalPolicy: on-request`. Claude runs in its `default` permission mode, and Luna Bot handles its
permission requests through `canUseTool`. Actions that a provider asks Luna Bot to approve are shown
to you before they run.

Agents can read and modify files on your computer, run programs, use the network, and control the
embedded browser. Approval prompts reduce this access but do not make agents a security boundary. Keep
backups, and do not give an agent a task you would not allow a local command-line tool to perform.

Computer Use is provided by a separately installed local Codex plugin. macOS permission prompts and
any plugin safety hand-offs remain controlled by macOS and that plugin.

## Exports

- **Backup ZIP:** Luna Bot can export a ZIP named `LunaBot-backup-<date>.zip`. It contains
  `lunabot-data.json` with agent profiles, memories, conversation snapshots, message queues, and
  managed attachments. It does not include CLI credentials, browser cookies, or agent workspace files.
- **Diagnostics export:** a JSON file with the app version, platform, CLI version, provider sign-in
  type, capability states, full-access state, bot and queue counts, and update history. Its privacy
  note states that it contains no conversations, URLs, emails, tokens, or file paths.

## Delete local data

Quit Luna Bot first, then delete:

- the `Luna Bot` folder in your home folder, which removes agent workspaces, shared transfers, and
  downloads. Review it first, since it may contain files you created;
- the Luna Bot data folder, which removes the database, conversations, the embedded browser's cookies
  and logins, downloaded runtimes, and the voice model.

Luna Bot does not delete `~/.codex` or `~/.claude`. Use each CLI's own controls if you also want to
remove its local data.

Keep a backup of anything you need before deleting these folders.

## Questions

Ask privacy questions through the maintainer, as described in [SUPPORT.md](SUPPORT.md).
Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), without attaching
credentials, conversations, or unrelated private files.
