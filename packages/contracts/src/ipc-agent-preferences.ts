import { isNumber } from "./runtime-values";

export const AGENT_MEMORY_LIMITS = [64, 128, 256, 512] as const;
export type AgentMemoryLimit = (typeof AGENT_MEMORY_LIMITS)[number];
export const DEFAULT_AGENT_MEMORY_LIMIT: AgentMemoryLimit = 64;

export function isAgentMemoryLimit(value: unknown): value is AgentMemoryLimit {
  return AGENT_MEMORY_LIMITS.some((limit) => limit === value);
}

export const BUSY_MESSAGE_MODES = ["queue", "steer"] as const;
export type BusyMessageMode = (typeof BUSY_MESSAGE_MODES)[number];
export const DEFAULT_BUSY_MESSAGE_MODE: BusyMessageMode = "queue";

export function isBusyMessageMode(value: unknown): value is BusyMessageMode {
  return BUSY_MESSAGE_MODES.some((mode) => mode === value);
}

/** What closing the main window does on Windows and Linux. macOS always keeps Luna Bot in the background. */
export const WINDOW_CLOSE_BEHAVIORS = ["ask", "keep", "quit"] as const;
export type WindowCloseBehavior = (typeof WINDOW_CLOSE_BEHAVIORS)[number];
export const DEFAULT_WINDOW_CLOSE_BEHAVIOR: WindowCloseBehavior = "ask";

export function isWindowCloseBehavior(value: unknown): value is WindowCloseBehavior {
  return WINDOW_CLOSE_BEHAVIORS.some((behavior) => behavior === value);
}

/**
 * Per-agent answer to approval requests from the provider. `ask` always shows the approval card. The other modes
 * accept requests that stay inside the agent's project folder; network access, writes outside it, destructive
 * commands and requests for wider scope always still ask.
 */
export const APPROVAL_POLICY_MODES = ["ask", "safe-project", "project-all"] as const;
export type ApprovalPolicyMode = (typeof APPROVAL_POLICY_MODES)[number];
export const DEFAULT_APPROVAL_POLICY_MODE: ApprovalPolicyMode = "ask";

export function isApprovalPolicyMode(value: unknown): value is ApprovalPolicyMode {
  return APPROVAL_POLICY_MODES.some((mode) => mode === value);
}

export const CLAUDE_COMPACT_WINDOW_MIN = 100_000;
export const CLAUDE_COMPACT_WINDOW_MAX = 1_000_000;

export function isClaudeCompactWindow(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= CLAUDE_COMPACT_WINDOW_MIN &&
    value <= CLAUDE_COMPACT_WINDOW_MAX
  );
}
