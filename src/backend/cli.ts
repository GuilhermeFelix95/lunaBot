import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, posix, resolve, win32 } from "node:path";
import { promisify } from "node:util";
import { nativeMessage } from "../main/native-messages";

const execFileAsync = promisify(execFile);
const MINIMUM_CODEX_VERSION = [0, 144, 1] as const;
const MINIMUM_CLAUDE_VERSION = [2, 1, 232] as const;
const MINIMUM_GROK_VERSION = [1, 0, 5] as const;

export interface CodexCliInfo {
  executable: string;
  version: string;
  source: "system" | "managed";
}

export interface ClaudeCliInfo {
  executable: string;
  version: string;
  source?: "system" | "managed";
}

export interface GrokCliInfo {
  executable: string;
  version: string;
  source?: "system" | "managed";
}

export type AgentCliInfo = CodexCliInfo | ClaudeCliInfo | GrokCliInfo;

export class CodexCliError extends Error {
  constructor(
    message: string,
    readonly code: "missing" | "invalid" | "outdated",
  ) {
    super(message);
    this.name = "CodexCliError";
  }
}

export async function resolveCodexCli(
  input: { systemCandidates?: string[]; bundledExecutable?: string | null } = {},
): Promise<CodexCliInfo> {
  const systemCandidates = input.systemCandidates ?? (await collectCandidates("codex", process.env.LUNABOT_CODEX_PATH));
  const bundledExecutable = input.bundledExecutable === undefined ? bundledCodexExecutable() : input.bundledExecutable;
  const candidates = [
    ...systemCandidates.map((executable) => ({ executable, source: "system" as const })),
    ...(bundledExecutable ? [{ executable: bundledExecutable, source: "managed" as const }] : []),
  ].filter((candidate, index, all) => all.findIndex((other) => other.executable === candidate.executable) === index);
  const failures: CodexCliError[] = [];

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate.executable))) continue;

    try {
      const stdout = await readCliVersion(candidate.executable);
      const version = parseCodexVersion(stdout);
      if (!isMinimumVersion(version, MINIMUM_CODEX_VERSION)) {
        throw new CodexCliError(nativeMessage("errors.provider.codexOutdated", { version }), "outdated");
      }

      return { executable: candidate.executable, version, source: candidate.source };
    } catch (error) {
      failures.push(
        error instanceof CodexCliError
          ? error
          : new CodexCliError(nativeMessage("errors.provider.codexStartFailed"), "invalid"),
      );
    }
  }

  const outdated = failures.find((failure) => failure.code === "outdated");
  if (outdated) throw outdated;
  if (failures.length > 0) {
    throw new CodexCliError(nativeMessage("errors.provider.codexInvalid"), "invalid");
  }

  throw new CodexCliError(nativeMessage("errors.provider.codexMissing"), "missing");
}

export function bundledCodexExecutable(
  platform = process.platform,
  architecture = process.arch,
  resourcesPath: string | null | undefined = process.resourcesPath,
): string | null {
  return bundledProviderExecutable("codex", platform, architecture, resourcesPath);
}

export async function resolveClaudeCli(
  input: { systemCandidates?: string[]; bundledExecutable?: string | null } = {},
): Promise<ClaudeCliInfo> {
  const systemCandidates =
    input.systemCandidates ?? (await collectCandidates("claude", process.env.LUNABOT_CLAUDE_PATH));
  const bundledExecutable = input.bundledExecutable === undefined ? bundledClaudeExecutable() : input.bundledExecutable;
  const candidates = [
    ...systemCandidates.map((executable) => ({ executable, source: "system" as const })),
    ...(bundledExecutable ? [{ executable: bundledExecutable, source: "managed" as const }] : []),
  ].filter((candidate, index, all) => all.findIndex((other) => other.executable === candidate.executable) === index);
  const failures: CodexCliError[] = [];

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate.executable))) continue;

    try {
      const stdout = await readCliVersion(candidate.executable);
      const version = parseClaudeVersion(stdout);
      if (!isMinimumVersion(version, MINIMUM_CLAUDE_VERSION)) {
        throw new CodexCliError(nativeMessage("errors.provider.claudeOutdated", { version }), "outdated");
      }
      return { executable: candidate.executable, version, source: candidate.source };
    } catch (error) {
      failures.push(
        error instanceof CodexCliError
          ? error
          : new CodexCliError(nativeMessage("errors.provider.claudeStartFailed"), "invalid"),
      );
    }
  }

  const outdated = failures.find((failure) => failure.code === "outdated");
  if (outdated) throw outdated;
  if (failures.length > 0) {
    throw new CodexCliError(nativeMessage("errors.provider.claudeInvalid"), "invalid");
  }

  throw new CodexCliError(nativeMessage("errors.provider.claudeMissing"), "missing");
}

export function bundledClaudeExecutable(
  platform = process.platform,
  architecture = process.arch,
  resourcesPath: string | null | undefined = process.resourcesPath,
): string | null {
  return bundledProviderExecutable("claude", platform, architecture, resourcesPath);
}

export async function resolveGrokCli(
  input: { systemCandidates?: string[]; bundledExecutable?: string | null } = {},
): Promise<GrokCliInfo> {
  const systemCandidates = input.systemCandidates ?? (await collectCandidates("grok", process.env.LUNABOT_GROK_PATH));
  const bundledExecutable = input.bundledExecutable === undefined ? bundledGrokExecutable() : input.bundledExecutable;
  const candidates = [
    ...systemCandidates.map((executable) => ({ executable, source: "system" as const })),
    ...(bundledExecutable ? [{ executable: bundledExecutable, source: "managed" as const }] : []),
  ].filter((candidate, index, all) => all.findIndex((other) => other.executable === candidate.executable) === index);
  const failures: CodexCliError[] = [];

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate.executable))) continue;

    try {
      const stdout = await readCliVersion(candidate.executable);
      const version = parseGrokVersion(stdout);
      if (!isMinimumVersion(version, MINIMUM_GROK_VERSION)) {
        throw new CodexCliError(nativeMessage("errors.provider.grokOutdated", { version }), "outdated");
      }
      return { executable: candidate.executable, version, source: candidate.source };
    } catch (error) {
      failures.push(
        error instanceof CodexCliError
          ? error
          : new CodexCliError(nativeMessage("errors.provider.grokStartFailed"), "invalid"),
      );
    }
  }

  const outdated = failures.find((failure) => failure.code === "outdated");
  if (outdated) throw outdated;
  if (failures.length > 0) {
    throw new CodexCliError(nativeMessage("errors.provider.grokInvalid"), "invalid");
  }

  throw new CodexCliError(nativeMessage("errors.provider.grokMissing"), "missing");
}

export function bundledGrokExecutable(
  platform = process.platform,
  architecture = process.arch,
  resourcesPath: string | null | undefined = process.resourcesPath,
): string | null {
  return bundledProviderExecutable("grok", platform, architecture, resourcesPath);
}

function bundledProviderExecutable(
  provider: "codex" | "claude" | "grok",
  platform: NodeJS.Platform,
  architecture: string,
  resourcesPath: string | null | undefined,
): string | null {
  // linux/arm64 is not packaged yet, so it has no bundled runtime.
  const targetPlatform =
    platform === "darwin" && architecture === "arm64"
      ? "mac"
      : platform === "win32" && architecture === "x64"
        ? "win"
        : platform === "linux" && architecture === "x64"
          ? "linux"
          : null;
  if (!targetPlatform) return null;

  const executable = platform === "win32" ? `${provider}.exe` : provider;
  if (!resourcesPath) {
    return resolve("build", provider, targetPlatform, architecture, "bin", executable);
  }

  const targetPath = platform === "win32" ? win32 : posix;
  return targetPath.join(resourcesPath, provider, targetPlatform, architecture, "bin", executable);
}

export function parseCodexVersion(output: string): string {
  const match = output.match(/(?:codex-cli\s+)?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) throw new CodexCliError(nativeMessage("errors.provider.codexVersionUnreadable"), "invalid");
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function parseClaudeVersion(output: string): string {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)(?:\s+\(Claude Code\))?/i);
  if (!match) throw new CodexCliError(nativeMessage("errors.provider.claudeVersionUnreadable"), "invalid");
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function parseGrokVersion(output: string): string {
  const match = output.match(/(?:grok(?:-cli)?\s+)?v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) throw new CodexCliError(nativeMessage("errors.provider.grokVersionUnreadable"), "invalid");
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function isMinimumVersion(version: string, minimum: readonly number[]): boolean {
  const parts = version.split(".").map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (parts[index] > minimum[index]) return true;
    if (parts[index] < minimum[index]) return false;
  }
  return true;
}

async function collectCandidates(
  command: "codex" | "claude" | "grok",
  configuredPath: string | undefined,
): Promise<string[]> {
  const candidates: string[] = [];
  const override = configuredPath?.trim();
  if (override) return [override];

  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("where.exe", [command], {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      });
      candidates.push(
        ...stdout
          .split(/\r?\n/u)
          .map((path) => path.trim())
          .filter(Boolean),
      );
    } catch {
      // Known Windows install locations are checked next.
    }
    candidates.push(...windowsFallbackPaths(command));
  } else {
    try {
      const { stdout } = await execFileAsync(await posixLoginShell(), ["-lic", `command -v ${command}`], {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      });
      if (stdout.trim()) candidates.push(stdout.trim());
    } catch {
      // Packaged macOS apps often have a restricted PATH; known locations are checked next.
    }
    candidates.push(...posixFallbackPaths(command));
  }

  return [...new Set(candidates)];
}

export function windowsFallbackPaths(
  command: "codex" | "claude" | "grok",
  userHome = homedir(),
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const paths: string[] = [];
  const appData = environment.APPDATA?.trim();
  const localAppData = environment.LOCALAPPDATA?.trim();

  if (command === "codex" && localAppData) {
    paths.push(win32.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"));
  }
  if (command === "claude" && localAppData) {
    paths.push(win32.join(localAppData, "Microsoft", "WinGet", "Links", "claude.exe"));
  }
  if (command === "grok") {
    paths.push(win32.join(userHome, ".grok", "bin", "grok.exe"));
    if (localAppData) paths.push(win32.join(localAppData, "Microsoft", "WinGet", "Links", "grok.exe"));
  }
  if (appData) paths.push(win32.join(appData, "npm", `${command}.cmd`));
  paths.push(
    win32.join(userHome, ".local", "bin", `${command}.exe`),
    win32.join(userHome, ".bun", "bin", `${command}.exe`),
    win32.join(userHome, ".bun", "bin", `${command}.cmd`),
  );
  if (localAppData) {
    paths.push(win32.join(localAppData, "pnpm", `${command}.exe`), win32.join(localAppData, "pnpm", `${command}.cmd`));
  }

  return paths;
}

export function posixFallbackPaths(command: "codex" | "claude" | "grok", userHome = homedir()): string[] {
  const paths = [posix.join(userHome, ".local", "bin", command)];
  if (command === "claude") paths.push(posix.join(userHome, ".claude", "local", "claude"));
  if (command === "grok") paths.push(posix.join(userHome, ".grok", "bin", "grok"));
  paths.push(`/opt/homebrew/bin/${command}`, `/usr/local/bin/${command}`);
  return paths;
}

async function posixLoginShell(): Promise<string> {
  if (process.platform === "darwin") return "/bin/zsh";
  const configured = process.env.SHELL?.trim();
  if (configured) {
    try {
      await access(configured, constants.X_OK);
      return configured;
    } catch {
      // An unusable $SHELL falls back to the POSIX shell.
    }
  }
  return "/bin/sh";
}

async function readCliVersion(candidate: string): Promise<string> {
  if (process.platform === "win32" && [".bat", ".cmd"].includes(extname(candidate).toLowerCase())) {
    const commandProcessor = process.env.ComSpec?.trim() || "cmd.exe";
    const escapedCandidate = candidate.replaceAll("%", "%%");
    const { stdout } = await execFileAsync(commandProcessor, ["/d", "/s", "/c", `""${escapedCandidate}" --version"`], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    return stdout;
  }

  const { stdout } = await execFileAsync(candidate, ["--version"], {
    timeout: 5_000,
    maxBuffer: 64 * 1024,
    windowsHide: process.platform === "win32",
  });
  return stdout;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
