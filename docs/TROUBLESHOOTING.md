# Troubleshooting Luna Bot

## Luna Bot says agent CLI setup is required

Open Terminal and verify the CLI:

```bash
codex --version
```

If the command is missing, install Codex using the official installer:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Then run `codex login`, sign in with ChatGPT, fully quit Luna Bot, and open it again.

You can use Claude instead. Verify and install Claude CLI:

```bash
claude --version
curl -fsSL https://claude.ai/install.sh | bash
claude auth login
```

If Codex is installed in a non-standard location, launch Luna Bot with `LUNABOT_CODEX_PATH` set to the
absolute Codex executable path.

For a non-standard Claude location, set `LUNABOT_CLAUDE_PATH` to the absolute Claude executable path.

## Computer Use is unavailable

Computer Use requires a compatible local Codex plugin plus macOS Screen Recording and Accessibility
permissions. Open **System Settings → Privacy & Security**, grant the permissions requested by the
plugin, then restart Luna Bot. Luna Bot does not bypass macOS prompts or plugin safety hand-offs.

## Reset Luna Bot

Quit Luna Bot before moving data. To reset application state and the shared browser profile while
keeping agent workspaces, move this folder somewhere safe:

```text
~/Library/Application Support/LunaBot
```

To also reset agent workspaces, managed transfers, and downloads, move this folder as well:

```text
~/LunaBot
```

Luna Bot creates fresh folders on the next launch. Review and back up their contents first. Do not
remove `~/.codex` or `~/.claude` unless you intentionally want to manage CLI login and history.

## Uninstall

Quit Luna Bot and remove `LunaBot.app` from Applications. If you also want to remove local Luna Bot
data, follow the reset steps above. Agent CLIs and their data are independent and are not removed
with Luna Bot.

## Report a problem

Report reproducible bugs through the project's issue tracker. Include
the Luna Bot version, macOS version, Apple Silicon model, provider and CLI version, and minimal
reproduction steps. Never publish tokens, `~/.codex`, `~/.claude`, conversations, private files,
Electron user data, or full unreviewed diagnostics.
