import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { AgentMemoryLimit } from "@lunabot/contracts/ipc";
import {
  type BusyMessageMode,
  DEFAULT_AGENT_MEMORY_LIMIT,
  DEFAULT_BUSY_MESSAGE_MODE,
  DEFAULT_CLAUDE_COMPACT_WINDOW,
  DEFAULT_WINDOW_CLOSE_BEHAVIOR,
  isAgentMemoryLimit,
  isBusyMessageMode,
  isClaudeCompactWindow,
  isWindowCloseBehavior,
  type WindowCloseBehavior,
} from "@lunabot/contracts/ipc";
import { isDynamicRecord } from "@lunabot/contracts/runtime-values";

export interface AgentPreferences {
  memoryLimit: AgentMemoryLimit;
  /** Tokens for CLAUDE_CODE_AUTO_COMPACT_WINDOW. `null` leaves the Claude CLI's own default in place. */
  claudeCompactWindow: number | null;
  /** What a message sent while an agent works does: join the queue, or steer into the running turn. */
  busyMessageMode: BusyMessageMode;
  /** What closing the main window does on Windows and Linux. */
  windowCloseBehavior: WindowCloseBehavior;
}

const DEFAULT_PREFERENCES: AgentPreferences = {
  memoryLimit: DEFAULT_AGENT_MEMORY_LIMIT,
  claudeCompactWindow: DEFAULT_CLAUDE_COMPACT_WINDOW,
  busyMessageMode: DEFAULT_BUSY_MESSAGE_MODE,
  windowCloseBehavior: DEFAULT_WINDOW_CLOSE_BEHAVIOR,
};

export async function readAgentPreferences(path: string): Promise<AgentPreferences> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!isDynamicRecord(parsed) || parsed.version !== 1) return { ...DEFAULT_PREFERENCES };
    return {
      memoryLimit: isAgentMemoryLimit(parsed.memoryLimit) ? parsed.memoryLimit : DEFAULT_PREFERENCES.memoryLimit,
      claudeCompactWindow: isClaudeCompactWindow(parsed.claudeCompactWindow)
        ? parsed.claudeCompactWindow
        : DEFAULT_PREFERENCES.claudeCompactWindow,
      busyMessageMode: isBusyMessageMode(parsed.busyMessageMode)
        ? parsed.busyMessageMode
        : DEFAULT_PREFERENCES.busyMessageMode,
      windowCloseBehavior: isWindowCloseBehavior(parsed.windowCloseBehavior)
        ? parsed.windowCloseBehavior
        : DEFAULT_PREFERENCES.windowCloseBehavior,
    };
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return { ...DEFAULT_PREFERENCES };
    throw error;
  }
}

/**
 * Updates are serialized so that each read-merge-write sees the result of the previous one. Without the
 * chain, two quick changes could both read the old file and the later rename would drop the other value.
 */
let pendingWrite: Promise<unknown> = Promise.resolve();

export function updateAgentPreferences(path: string, patch: Partial<AgentPreferences>): Promise<AgentPreferences> {
  const write = pendingWrite.then(
    () => replaceAgentPreferences(path, patch),
    () => replaceAgentPreferences(path, patch),
  );
  pendingWrite = write.catch(() => undefined);
  return write;
}

async function replaceAgentPreferences(path: string, patch: Partial<AgentPreferences>): Promise<AgentPreferences> {
  const preferences = { ...(await readAgentPreferences(path)), ...patch };
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify({
        version: 1,
        memoryLimit: preferences.memoryLimit,
        claudeCompactWindow: preferences.claudeCompactWindow,
        busyMessageMode: preferences.busyMessageMode,
        windowCloseBehavior: preferences.windowCloseBehavior,
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, path);
    return preferences;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
