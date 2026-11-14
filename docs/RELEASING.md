# Building Luna Bot packages

Luna Bot packages are built with electron-builder. The Windows installer is built and published to GitHub
Releases by `.github/workflows/release.yml`. macOS and Linux packages are built on their own machines.
Packages are unsigned and not notarized.

## What the package contains

- The Electron app and the Whisper voice executable.
- Codex, Claude, and Grok runtimes are not bundled. The app downloads a supported runtime on demand.
- The Whisper voice model is not bundled. The app downloads the pinned model on first voice use.

## Before a build

```bash
bun install --frozen-lockfile
bun run check
```

`bun run voice:prepare-runtime` builds whisper.cpp from source, so Windows and Linux builds need `cmake` and
a C++ compiler on the machine (MSVC Build Tools on Windows, g++ and make on Linux).

`check` runs Biome, the UI foundation check, typechecks, the browser smoke test, the production build,
and the offline test suite.

## Version and changelog

```bash
bun run release:patch   # or: bun run release:minor / bun run release:major
```

The command updates `version` in `package.json` and moves the entries under `## [Unreleased]` in
`CHANGELOG.md` into a dated version heading. Review the diff. If you want a version record, commit it
and tag it locally with `git tag -a vX.Y.Z -m "Luna Bot vX.Y.Z"`. The command itself does not commit,
push, or publish.

## Build a package

| Platform | Run on | Command | Output in `dist/` |
| --- | --- | --- | --- |
| Windows x64 installer | Windows | `bun run dist:win` | `LunaBot-Setup-<version>.exe`, `.exe.blockmap`, and `latest.yml` |
| macOS ARM64 disk image and ZIP | macOS | `bun run dist:mac` | `Luna Bot-<version>-arm64.dmg` and `.zip` |
| Linux x64 AppImage and deb | Linux (Ubuntu, or the `package-linux` CI job) | `bun run dist:linux` | `Luna Bot-<version>-x86_64.AppImage` and `-amd64.deb` |

Each command prepares the Whisper runtime, runs `electron-vite build`, and then packages the app
without signing it. Windows can show an `Unknown publisher` or SmartScreen warning. macOS may refuse
to open an unsigned app built on another machine. Run the `dist:*` scripts rather than `electron-builder`
alone, because only they prepare `.lunabot-build/whisper/bin` first.

Linux packages have no auto-update. Users install the AppImage or the deb by hand. The deb declares
its runtime libraries in `linux.deb.depends` in `electron-builder.yml`. The AppArmor profile for
Ubuntu 24+ is `build/apparmor-profile`. Linux packages are built for x64 only.

Linux sandbox: the app keeps Electron's sandbox on (`app.enableSandbox()` in `src/main/index.ts`) and never
passes `--no-sandbox`. The Chromium sandbox helper `chrome-sandbox` needs either the setuid bit or unprivileged
user namespaces. The deb gets the second through `deb.appArmorProfile` in `electron-builder.yml`, which installs
`build/apparmor-profile` with `userns` for Ubuntu 24+. The AppImage has no profile in this repository, so on
Ubuntu 24+ it needs unprivileged user namespaces to be allowed. The setuid/user-namespace requirement is taken from
the repository setup and was not checked against an online Chromium source. Neither package was launched on Linux
for this change, so check both on the target release before shipping.

## Verify the unpacked app

- Windows: `bun run package:win:verify` builds an unpacked x64 app and runs the Windows package checks. After
  `bun run dist:win`, `bun run verify:package:win -- --require-update-metadata` checks `dist/win-unpacked`, including
  `resources/app-update.yml` with `provider: github`.
- macOS: `bun run package:verify` builds an unpacked ARM64 app and runs the macOS package checks.
- Linux: after `bun run dist:linux`, `bun run verify:package:linux` checks the AppImage and deb in `dist/`:
  deb control fields, the desktop entry, the Whisper executable, the Claude SDK isolation, and forbidden text.
  It does not launch the app.

After a verify run, launch the unpacked app, complete setup, and check a chat turn, queues,
attachments, agent-to-agent messages, and browser control.

## Release a Windows version

1. Set the version with `bun run release:patch`, `bun run release:minor`, or `bun run release:major`, or edit
   `version` in `package.json` by hand. The release command moves the `## [Unreleased]` entries of
   `CHANGELOG.md` under a dated heading. Review the diff. Versions must increase, because installed apps only
   offer a newer version.
2. Commit the change with a DCO sign-off, for example `git commit -s -m "chore(release): 0.1.0"`.
3. Tag the commit and push the tag: `git tag -a v0.1.0 -m "Luna Bot v0.1.0"`, then `git push origin v0.1.0`.
   The tag must be `v` followed by the `package.json` version. Otherwise the workflow stops before the build.
4. The `Release` workflow runs on `windows-latest`. It builds the NSIS installer and creates a **draft** release
   with `LunaBot-Setup-<version>.exe`, `LunaBot-Setup-<version>.exe.blockmap`, and `latest.yml`. `latest.yml` is
   the metadata that installed apps read. `electron-builder.yml` sets `releaseType: release`, but the workflow sets
   `EP_DRAFT=true`, which takes priority, so CI never publishes directly. A step before the build creates the draft with `gh release create` if it is missing, so electron-builder reuses it instead of creating duplicates.
5. Review the draft on the GitHub Releases page and check its notes. Then choose **Publish release**. The updater
   reads GitHub's public release feed, so an unpublished draft is not offered to installed apps.

Linux packages are built by the same workflow (`dist:linux`) and uploaded as workflow artifacts only. They are not
attached to the release.

## How installed apps update

- Only packaged builds check. `UpdateService` is enabled when the app is packaged, runs on Windows or macOS, and
  `resources/app-update.yml` exists. Development runs and Linux packages never check.
- The feed comes from the `publish` block in `electron-builder.yml`. electron-builder writes it into the app as
  `app-update.yml` with `provider: github`, `owner: GuilhermeFelix95`, and `repo: lunaBot`. electron-updater reads
  that repository only. No other host is configured.
- The first check runs about 12 seconds after launch, then every four hours. Downloads follow the update preference.
  Installing waits for the user's restart action, because `autoInstallOnAppQuit` is off.
- Signature checks: electron-builder writes `publisherName` into `app-update.yml` only from a code-signing
  certificate. Without one, electron-updater skips the signature check (`NsisUpdater.verifySignature` returns
  `null` when `publisherName` is absent). Signing is not set up. When it is, the signing configuration goes in
  `electron-builder.yml` next to the `win` section, and the check then runs for new updates.

## Not configured

- Code signing and notarization for macOS and Windows, and signed Linux packages.
- Automatic publishing for macOS. Linux packages are workflow artifacts only, and Linux has no auto-update.
- An end-to-end update test between two published versions. It has not been run yet.
