import type {
  AgentMemoryLimit,
  AgentProviderId,
  AppLocale,
  AppMode,
  ApprovalPolicyMode,
  AppTheme,
  BusyMessageMode,
  DynamicIslandAction,
  DynamicIslandPreference,
  DynamicIslandPresentation,
  ExternalDestination,
  MacPermissionId,
  UpdatePreference,
  WindowCloseBehavior,
} from "@lunabot/contracts/ipc";
import {
  APP_LOCALES,
  APP_MODES,
  APP_THEMES,
  isAgentMemoryLimit,
  isApprovalPolicyMode,
  isBusyMessageMode,
  isClaudeCompactWindow,
  isDynamicIslandAction,
  isDynamicIslandInteractive,
  isDynamicIslandPreference,
  isDynamicIslandPresentation,
  isWindowCloseBehavior,
} from "@lunabot/contracts/ipc";
import { isBoolean, isDynamicRecord, isString } from "@lunabot/contracts/runtime-values";

export function parseSetTheme(input: unknown): { theme: AppTheme; mode: AppMode } {
  const theme = isDynamicRecord(input) ? APP_THEMES.find((option) => option === input.theme) : undefined;
  if (!theme) throw new Error("Theme is invalid.");
  const mode = isDynamicRecord(input) ? APP_MODES.find((option) => option === input.mode) : undefined;
  if (!mode) throw new Error("Mode is invalid.");
  return { theme, mode };
}

export function parseSetLocale(input: unknown): { locale: AppLocale } {
  const locale = isDynamicRecord(input) ? APP_LOCALES.find((option) => option === input.locale) : undefined;
  if (!locale) throw new Error("Locale is invalid.");
  return { locale };
}

export function parseProvider(input: unknown): AgentProviderId {
  if (!isDynamicRecord(input)) throw new Error("Setup input is required.");
  const provider = input.preferredProvider;
  if (provider !== "codex" && provider !== "claude" && provider !== "grok") throw new Error("Unknown provider.");
  return provider;
}

export function parseProviderId(input: unknown): AgentProviderId {
  if (input !== "codex" && input !== "claude" && input !== "grok") throw new Error("Unknown provider.");
  return input;
}

export function parseUpdatePreference(input: unknown): UpdatePreference {
  if (!isDynamicRecord(input) || !isBoolean(input.autoDownload)) throw new Error("Update preference is required.");
  return { autoDownload: input.autoDownload };
}

export function parseAgentMemoryLimit(input: unknown): AgentMemoryLimit {
  if (!isAgentMemoryLimit(input)) throw new Error("Memory limit is invalid.");
  return input;
}

export function parseClaudeCompactWindow(input: unknown): number | null {
  if (input === null) return null;
  if (!isClaudeCompactWindow(input)) throw new Error("Compaction window is invalid.");
  return input;
}

export function parseBusyMessageMode(input: unknown): BusyMessageMode {
  if (!isBusyMessageMode(input)) throw new Error("Busy message mode is invalid.");
  return input;
}

export function parseWindowCloseBehavior(input: unknown): WindowCloseBehavior {
  if (!isWindowCloseBehavior(input)) throw new Error("Window close behavior is invalid.");
  return input;
}

export function parseApprovalPolicyBotId(input: unknown): string {
  if (!isString(input) || input.length === 0) throw new Error("Agent id is invalid.");
  return input;
}

export function parseApprovalPolicyInput(input: unknown): { botId: string; mode: ApprovalPolicyMode } {
  if (!isDynamicRecord(input)) throw new Error("Approval policy input is required.");
  if (!isApprovalPolicyMode(input.mode)) throw new Error("Approval policy is invalid.");
  return { botId: parseApprovalPolicyBotId(input.botId), mode: input.mode };
}

export function parseDynamicIslandPreference(input: unknown): DynamicIslandPreference {
  if (!isDynamicIslandPreference(input)) {
    throw new Error("The Dynamic Island preference value is missing.");
  }
  return input;
}

export function parseDynamicIslandInteractive(input: unknown): { interactive: boolean } {
  if (!isDynamicIslandInteractive(input)) {
    throw new Error("The Dynamic Island interaction state value is missing.");
  }
  return input;
}

export function parseDynamicIslandPresentation(input: unknown): DynamicIslandPresentation {
  if (!isDynamicIslandPresentation(input)) throw new Error("The Dynamic Island presentation value is not valid.");
  return input;
}

export function parseDynamicIslandAction(input: unknown): DynamicIslandAction {
  if (isDynamicIslandAction(input)) return input;
  throw new Error("The Dynamic Island action value is not valid.");
}

export function parseMacPermission(input: unknown): MacPermissionId {
  if (input !== "screen-recording" && input !== "accessibility") {
    throw new Error("Unknown macOS permission.");
  }
  return input;
}

export function parseExternalDestination(input: unknown): ExternalDestination {
  if (input !== "claude-install" && input !== "claude-sign-in") {
    throw new Error("Unknown external destination.");
  }
  return input;
}
