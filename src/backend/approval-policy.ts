import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AgentApprovalKind, AgentApprovalPermissions, ApprovalPolicyMode } from "@lunabot/contracts/ipc";

/**
 * Why an approval must still be shown to the user even though the agent's policy allows automation.
 * `unscoped` is the one soft reason: `safe-project` wants the request to name its location, `project-all` does not.
 */
export type ApprovalAskReason = "network" | "outside-project" | "destructive-command" | "expanded-scope" | "unscoped";

export interface ApprovalAutomationRequest {
  kind: AgentApprovalKind;
  command: string | null;
  cwd: string | null;
  grantRoot: string | null;
  permissions: AgentApprovalPermissions | null;
}

export type ApprovalAutomationDecision =
  | { action: "accept"; mode: Exclude<ApprovalPolicyMode, "ask"> }
  | { action: "ask"; reasons: ApprovalAskReason[] };

export interface ApprovalAutomationInput {
  mode: ApprovalPolicyMode;
  request: ApprovalAutomationRequest;
  /** The agent's project folder. Every location the request names is judged against it. */
  projectRoot: string;
  /**
   * Returns the real location of an absolute path, following symlinks. A path that does not exist yet must resolve
   * through its nearest existing ancestor so that a new file inside a symlink that points elsewhere counts as outside.
   */
  resolveRealPath: (absolutePath: string) => string;
}

const NETWORK_COMMAND =
  /\b(?:curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm|ssh|scp|sftp|ftp|telnet|nc|netcat)\b/i;
const NETWORK_PACKAGE_COMMAND =
  /\b(?:npm|pnpm|yarn|bun|pip|pip3|uv|cargo|gem|composer)\s+(?:install|add|i|update|upgrade)\b|\bgo\s+get\b/i;
const NETWORK_GIT_COMMAND = /\bgit\s+(?:push|pull|fetch|clone|ls-remote|submodule\s+update)\b/i;

const DESTRUCTIVE_COMMANDS: readonly RegExp[] = [
  // rm, rmdir, unlink, del, erase, rd: any file or directory removal counts, with or without -rf
  /(?:^|[\s;&|(])(?:rm|rmdir|unlink|del|erase|rd)\s/i,
  /\bRemove-Item\b/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs(?:\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /\bdrop\s+(?:table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bgit\s+push\b.*(?:--force|--force-with-lease|\s-f\b)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b.*\s-\S*f/i,
  /\bshutdown\b/i,
];

const HOME_DIRECTORY_TOKEN = /^~/;
const DEVICE_NULL = "/dev/null";

export function decideApprovalAutomation(input: ApprovalAutomationInput): ApprovalAutomationDecision {
  if (input.mode === "ask") return { action: "ask", reasons: [] };
  const reasons = hardAskReasons(input);
  if (reasons.length > 0) return { action: "ask", reasons };
  if (input.mode === "safe-project" && !namesLocation(input.request)) return { action: "ask", reasons: ["unscoped"] };
  return { action: "accept", mode: input.mode };
}

function hardAskReasons(input: ApprovalAutomationInput): ApprovalAskReason[] {
  const { request, projectRoot, resolveRealPath } = input;
  const reasons = new Set<ApprovalAskReason>();
  const insideProject = (candidate: string, base: string): boolean =>
    isInsideDirectory(resolveRealPath(resolve(projectRoot)), resolveRealPath(resolve(base, candidate)));

  if (request.permissions?.network === true) reasons.add("network");

  const commandBase = request.cwd !== null ? resolve(projectRoot, request.cwd) : projectRoot;
  const command = request.command;
  if (command !== null) {
    if (isNetworkCommand(command)) reasons.add("network");
    if (DESTRUCTIVE_COMMANDS.some((pattern) => pattern.test(command))) reasons.add("destructive-command");
    for (const token of commandPathTokens(command)) {
      if (token === DEVICE_NULL) continue;
      if (HOME_DIRECTORY_TOKEN.test(token) || !insideProject(token, commandBase)) reasons.add("outside-project");
    }
  }

  if (request.cwd !== null && !insideProject(request.cwd, projectRoot)) reasons.add("outside-project");
  if (request.grantRoot !== null && !insideProject(request.grantRoot, projectRoot)) reasons.add("outside-project");

  if (request.kind === "permissions" && request.permissions === null) reasons.add("expanded-scope");
  if (request.permissions !== null) {
    const { fileSystem } = request.permissions;
    const declaredPaths = fileSystem.read.length + fileSystem.write.length;
    if (declaredPaths === 0 && !request.permissions.network) reasons.add("expanded-scope");
    for (const path of fileSystem.write) {
      if (!insideProject(path, projectRoot)) reasons.add("outside-project");
    }
    for (const path of fileSystem.read) {
      if (!insideProject(path, projectRoot)) reasons.add("expanded-scope");
    }
  }

  return [...reasons];
}

function namesLocation(request: ApprovalAutomationRequest): boolean {
  if (request.kind === "permissions") return true;
  if (request.kind === "command") return request.cwd !== null;
  return request.grantRoot !== null;
}

function isNetworkCommand(command: string): boolean {
  return NETWORK_COMMAND.test(command) || NETWORK_PACKAGE_COMMAND.test(command) || NETWORK_GIT_COMMAND.test(command);
}

/** Tokens that look like filesystem locations: absolute, home-relative, drive-rooted, or containing `..`. */
function commandPathTokens(command: string): string[] {
  return command
    .split(/\s+/)
    .map((token) => token.replace(/^["']|["']$/g, "").replace(/^-{1,2}[^=\s]+=/, ""))
    .filter((token) => token.length > 0)
    .filter(
      (token) =>
        token.startsWith("/") ||
        token.startsWith("\\") ||
        token.startsWith("~") ||
        /^[a-zA-Z]:[\\/]/.test(token) ||
        token.split(/[\\/]/).includes(".."),
    );
}

function isInsideDirectory(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  if (relativePath === "") return true;
  if (isAbsolute(relativePath)) return false;
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}
