import {
  type AgentMemoryLimit,
  type BusyMessageMode,
  DEFAULT_AGENT_MEMORY_LIMIT,
  DEFAULT_BUSY_MESSAGE_MODE,
  DEFAULT_CLAUDE_COMPACT_WINDOW,
  DEFAULT_WINDOW_CLOSE_BEHAVIOR,
  type WindowCloseBehavior,
} from "@lunabot/contracts/ipc";

export type ExternalLinkTarget = "Default browser" | "Luna Bot";

export interface GeneralSettingsValue {
  launchAtLogin: boolean;
  windowCloseBehavior: WindowCloseBehavior;
  restoreLastWorkspace: boolean;
  externalLinkTarget: ExternalLinkTarget;
  desktopNotifications: boolean;
  macBookNotch: boolean;
  macBookNotchHaptics: boolean;
  macBookNotchIdle: boolean;
  macBookNotchAdditionalDisplays: boolean;
  taskCompletionSound: boolean;
  autoDownloadUpdates: boolean;
  agentMemoryLimit: AgentMemoryLimit;
  claudeCompactWindow: number | null;
  busyMessageMode: BusyMessageMode;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettingsValue = {
  launchAtLogin: true,
  windowCloseBehavior: DEFAULT_WINDOW_CLOSE_BEHAVIOR,
  restoreLastWorkspace: true,
  externalLinkTarget: "Default browser",
  desktopNotifications: true,
  macBookNotch: true,
  macBookNotchHaptics: true,
  macBookNotchIdle: true,
  macBookNotchAdditionalDisplays: true,
  taskCompletionSound: false,
  autoDownloadUpdates: true,
  agentMemoryLimit: DEFAULT_AGENT_MEMORY_LIMIT,
  claudeCompactWindow: DEFAULT_CLAUDE_COMPACT_WINDOW,
  busyMessageMode: DEFAULT_BUSY_MESSAGE_MODE,
};
