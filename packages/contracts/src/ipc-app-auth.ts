import type { AgentProviderId } from "./ipc-conversation";

export type DesktopPlatform = "darwin" | "win32" | "linux";
export type AppVariant = "production" | "dev" | "preview";

export interface AppInfo {
  name: string;
  version: string;
  platform: DesktopPlatform;
  variant: AppVariant;
}

/** The phase list is the source of truth: `UpdatePhase` is derived from it. */
export const UPDATE_PHASES = [
  "idle",
  "checking",
  "available",
  "downloading",
  "ready",
  "installing",
  "up-to-date",
  "error",
  "unsupported",
] as const;

export type UpdatePhase = (typeof UPDATE_PHASES)[number];

/**
 * Phases where the user is waiting on work already under way. Every one of these must be bounded by
 * a timeout in the main-process updater, otherwise the UI renders a spinner that can never resolve.
 */
export const UPDATE_BUSY_PHASES = ["checking", "downloading", "installing"] as const satisfies readonly UpdatePhase[];

export type UpdateBusyPhase = (typeof UPDATE_BUSY_PHASES)[number];

/** Phases where an update is in play, which is what makes the update UI visible. */
export const UPDATE_ACTIVE_PHASES = [
  "available",
  "downloading",
  "ready",
  "installing",
] as const satisfies readonly UpdatePhase[];

const BUSY_PHASES = new Set<UpdatePhase>(UPDATE_BUSY_PHASES);
const ACTIVE_PHASES = new Set<UpdatePhase>(UPDATE_ACTIVE_PHASES);

export function isUpdateBusyPhase(phase: UpdatePhase): phase is UpdateBusyPhase {
  return BUSY_PHASES.has(phase);
}

export function isUpdateActivePhase(phase: UpdatePhase): boolean {
  return ACTIVE_PHASES.has(phase);
}

export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  checkedAt: string | null;
  message: string | null;
  errorCode: UpdateFailureCode | null;
}

export type UpdateFailureCode = "check_failed" | "download_failed" | "install_failed";

export interface UpdatePreference {
  autoDownload: boolean;
}

export type ProviderRuntimePhase = "not-downloaded" | "downloading" | "finishing" | "ready" | "download-error";

export interface ProviderRuntimeStatus {
  phase: ProviderRuntimePhase;
  progress: number | null;
  message: string | null;
  version: string | null;
}

export interface ProviderRuntimeSnapshot {
  revision: number;
  providers: Record<AgentProviderId, ProviderRuntimeStatus>;
}

export interface ExportResult {
  saved: boolean;
}

export interface AppSetupState {
  completed: boolean;
  preferredProvider: AgentProviderId | null;
}

export interface SaveSetupInput {
  preferredProvider: AgentProviderId;
}

export type MacPermissionId = "screen-recording" | "accessibility";

export type ComputerUseMacSetupStatus = "available" | "unavailable" | "unsupported";

export interface ComputerUseMacSetupState {
  status: ComputerUseMacSetupStatus;
  helperName: string;
  helperIconDataUrl: string | null;
  message: string | null;
}

export type ExternalDestination = "claude-install" | "claude-sign-in";
