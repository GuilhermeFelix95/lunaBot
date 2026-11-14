# Support

Luna Bot is an early open-source project maintained on a best-effort basis.

- Report reproducible bugs and focused feature requests through the project's issue tracker.
- For setup questions, ideas, and general help, contact the maintainer.
- Use the private process in `SECURITY.md` for vulnerabilities.

If you installed a release, first confirm that `codex --version` or `claude --version` works in
Terminal. Run `codex login` or `claude auth login`. Restart Luna Bot after signing in. See
[Troubleshooting](docs/TROUBLESHOOTING.md) for safe reset and uninstall steps.

If you are developing from source, run:

```bash
bun run codex:doctor
bun run check
```

Share only the relevant, redacted output. Never post credentials, private files, conversation
contents, `~/.codex`, `~/.claude`, Electron `userData`, or full unreviewed stderr in public.
