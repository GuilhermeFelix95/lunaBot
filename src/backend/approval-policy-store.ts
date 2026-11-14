import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type ApprovalPolicyMode, isApprovalPolicyMode } from "@lunabot/contracts/ipc";
import { isDynamicRecord } from "@lunabot/contracts/runtime-values";

/** Per-agent approval modes keyed by bot id. Agents that stay on `ask` have no entry. */
export async function readApprovalPolicies(path: string): Promise<Map<string, ApprovalPolicyMode>> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!isDynamicRecord(parsed) || parsed.version !== 1 || !isDynamicRecord(parsed.policies)) return new Map();
    return new Map(
      Object.entries(parsed.policies).filter((entry): entry is [string, ApprovalPolicyMode] =>
        isApprovalPolicyMode(entry[1]),
      ),
    );
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return new Map();
    throw error;
  }
}

/**
 * Writes are serialized so that a later write never races an earlier one and leaves the older map on disk. The file
 * is replaced atomically through a temporary file, the same way the agent preference file is written.
 */
let pendingWrite: Promise<unknown> = Promise.resolve();

export function writeApprovalPolicies(path: string, policies: ReadonlyMap<string, ApprovalPolicyMode>): Promise<void> {
  const snapshot = new Map(policies);
  const write = pendingWrite.then(
    () => replaceApprovalPolicies(path, snapshot),
    () => replaceApprovalPolicies(path, snapshot),
  );
  pendingWrite = write.catch(() => undefined);
  return write;
}

async function replaceApprovalPolicies(path: string, policies: ReadonlyMap<string, ApprovalPolicyMode>): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, policies: Object.fromEntries(policies) })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Real location of an absolute path. When the path does not exist yet, the nearest existing ancestor is resolved and
 * the missing segments are appended, so a symlinked parent still reveals where a new file would really land.
 */
export function realPathOrNearestAncestor(absolutePath: string): string {
  const missing: string[] = [];
  let current = absolutePath;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return absolutePath;
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
