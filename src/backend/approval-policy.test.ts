// @vitest-environment node

import { join, resolve, sep } from "node:path";
import type { ApprovalPolicyMode } from "@lunabot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { type ApprovalAutomationRequest, decideApprovalAutomation } from "./approval-policy";

const projectRoot = resolve("workspace", "lunabot-agent");
const elsewhere = resolve("elsewhere");
const identity = (absolutePath: string) => absolutePath;

describe("decideApprovalAutomation", () => {
  it("asks every time in ask mode, even for a safe in-project command", () => {
    expect(decide("ask")).toEqual({ action: "ask", reasons: [] });
  });

  it.each<ApprovalPolicyMode>(["safe-project", "project-all"])("accepts an in-project command in %s mode", (mode) => {
    expect(decide(mode)).toEqual({ action: "accept", mode });
  });

  it("accepts a path that uses .. but stays inside the project", () => {
    expect(decide("safe-project", { command: "cat src/../index.ts" })).toEqual({
      action: "accept",
      mode: "safe-project",
    });
  });

  it("accepts an absolute path inside the project", () => {
    const inside = join(projectRoot, "src", "index.ts");
    expect(decide("safe-project", { command: `cat ${inside}` })).toEqual({ action: "accept", mode: "safe-project" });
  });

  it.each([
    ["curl https://example.com", ["network"]],
    ["wget http://example.com/file", ["network"]],
    ["ssh deploy@host", ["network"]],
    ["npm install left-pad", ["network"]],
    ["pnpm add zod", ["network"]],
    ["bun add zod", ["network"]],
    ["pip install requests", ["network"]],
    ["go get example.com/module", ["network"]],
    ["git pull", ["network"]],
    ["git fetch origin", ["network"]],
    ["git push origin main", ["network"]],
  ])("asks for network access on %s in both automatic modes", (command, reasons) => {
    for (const mode of ["safe-project", "project-all"] as const) {
      expect(decide(mode, { command })).toEqual({ action: "ask", reasons });
    }
  });

  it("asks for network access when the permissions request enables it", () => {
    expect(
      decide("project-all", {
        kind: "permissions",
        command: null,
        cwd: null,
        permissions: permissions({ network: true }),
      }),
    ).toEqual({
      action: "ask",
      reasons: ["network"],
    });
  });

  it("does not treat ordinary git commands as network access", () => {
    expect(decide("safe-project", { command: "git status" })).toEqual({ action: "accept", mode: "safe-project" });
    expect(decide("safe-project", { command: "git diff --stat" })).toEqual({ action: "accept", mode: "safe-project" });
  });

  it.each([
    ["rm -rf build", ["destructive-command"]],
    ["rmdir old", ["destructive-command"]],
    ["del notes.txt", ["destructive-command"]],
    ["Remove-Item -Recurse build", ["destructive-command"]],
    ["format D:", ["destructive-command"]],
    ["mkfs.ext4 disk", ["destructive-command"]],
    ["dd if=image of=disk", ["destructive-command"]],
    ["psql -c 'DROP TABLE users'", ["destructive-command"]],
    ["DROP DATABASE app", ["destructive-command"]],
    ["truncate table logs", ["destructive-command"]],
    ["git reset --hard HEAD~1", ["destructive-command"]],
    ["git clean -fd", ["destructive-command"]],
    ["git push --force origin main", ["network", "destructive-command"]],
    ["shutdown now", ["destructive-command"]],
    ["npm test && rm -rf dist", ["destructive-command"]],
  ])("asks for the destructive command %s in both automatic modes", (command, reasons) => {
    for (const mode of ["safe-project", "project-all"] as const) {
      expect(decide(mode, { command })).toEqual({ action: "ask", reasons });
    }
  });

  it("does not flag commands that only contain a destructive word inside another word", () => {
    expect(decide("safe-project", { command: "echo confirm now" })).toEqual({ action: "accept", mode: "safe-project" });
  });

  it.each([
    ["cat ../secret.txt"],
    ["cat src/../../secret"],
    ["cat /etc/hosts"],
    ['cat "/etc/hosts"'],
    ["tool --out=/tmp/result"],
    ["cat ~/notes.txt"],
  ])("asks when the command reaches outside the project with %s", (command) => {
    expect(decide("project-all", { command })).toEqual({ action: "ask", reasons: ["outside-project"] });
  });

  it.skipIf(process.platform !== "win32")("asks when a Windows drive path points outside the project", () => {
    expect(decide("safe-project", { command: "type C:\\Windows\\win.ini" })).toEqual({
      action: "ask",
      reasons: ["outside-project"],
    });
  });

  it("exempts /dev/null from the outside-project check", () => {
    expect(decide("safe-project", { command: "npm test > /dev/null" })).toEqual({
      action: "accept",
      mode: "safe-project",
    });
  });

  it("asks when the command's working directory is outside the project", () => {
    expect(decide("project-all", { command: "npm test", cwd: "../other" })).toEqual({
      action: "ask",
      reasons: ["outside-project"],
    });
    expect(decide("project-all", { command: "npm test", cwd: elsewhere })).toEqual({
      action: "ask",
      reasons: ["outside-project"],
    });
  });

  it("asks when a file-change grant root is outside the project", () => {
    expect(decide("project-all", fileChange("../shared"))).toEqual({ action: "ask", reasons: ["outside-project"] });
  });

  it("accepts a file-change grant root inside the project in both automatic modes", () => {
    expect(decide("safe-project", fileChange("src"))).toEqual({ action: "accept", mode: "safe-project" });
    expect(decide("project-all", fileChange("src"))).toEqual({ action: "accept", mode: "project-all" });
  });

  it("asks for an unscoped command in safe-project mode but accepts it in project-all mode", () => {
    const unscoped = { command: "npm test", cwd: null };
    expect(decide("safe-project", unscoped)).toEqual({ action: "ask", reasons: ["unscoped"] });
    expect(decide("project-all", unscoped)).toEqual({ action: "accept", mode: "project-all" });
  });

  it("asks for an unscoped file change in safe-project mode but accepts it in project-all mode", () => {
    const unscoped = fileChange(null);
    expect(decide("safe-project", unscoped)).toEqual({ action: "ask", reasons: ["unscoped"] });
    expect(decide("project-all", unscoped)).toEqual({ action: "accept", mode: "project-all" });
  });

  it("keeps hard reasons in project-all mode even when the request is unscoped", () => {
    expect(decide("project-all", { command: "rm -rf dist", cwd: null })).toEqual({
      action: "ask",
      reasons: ["destructive-command"],
    });
    expect(decide("project-all", { command: "cat ../secret", cwd: null })).toEqual({
      action: "ask",
      reasons: ["outside-project"],
    });
  });

  it("asks for an expanded-scope permissions request that names no permissions", () => {
    const request = { kind: "permissions", command: null, cwd: null, grantRoot: null, permissions: null } as const;
    for (const mode of ["safe-project", "project-all"] as const) {
      expect(decide(mode, request)).toEqual({ action: "ask", reasons: ["expanded-scope"] });
    }
  });

  it("accepts a permissions request whose read and write paths stay inside the project", () => {
    const request = {
      kind: "permissions",
      command: null,
      cwd: null,
      grantRoot: null,
      permissions: permissions({ read: ["src"], write: ["out"] }),
    } as const;
    expect(decide("safe-project", request)).toEqual({ action: "accept", mode: "safe-project" });
  });

  it("asks when a permissions write path escapes the project", () => {
    const request = {
      kind: "permissions",
      command: null,
      cwd: null,
      grantRoot: null,
      permissions: permissions({ write: ["../shared"] }),
    } as const;
    expect(decide("project-all", request)).toEqual({ action: "ask", reasons: ["outside-project"] });
  });

  it("treats a permissions read outside the project as expanded scope, not as a write", () => {
    const request = {
      kind: "permissions",
      command: null,
      cwd: null,
      grantRoot: null,
      permissions: permissions({ read: ["/etc"] }),
    } as const;
    expect(decide("project-all", request)).toEqual({ action: "ask", reasons: ["expanded-scope"] });
  });

  it("treats a permissions request with no paths and no network as expanded scope", () => {
    const request = {
      kind: "permissions",
      command: null,
      cwd: null,
      grantRoot: null,
      permissions: permissions({}),
    } as const;
    expect(decide("project-all", request)).toEqual({ action: "ask", reasons: ["expanded-scope"] });
  });

  describe("symlinks", () => {
    const linked = join(projectRoot, "linked");

    it("asks when a working directory symlink resolves outside the project", () => {
      const resolveRealPath = linkResolver({ [linked]: elsewhere });
      expect(decide("project-all", { command: "npm test", cwd: "linked" }, resolveRealPath)).toEqual({
        action: "ask",
        reasons: ["outside-project"],
      });
    });

    it("asks when an absolute command path goes through a symlink that resolves outside", () => {
      const resolveRealPath = linkResolver({ [linked]: elsewhere });
      expect(decide("safe-project", { command: `cat ${join(linked, "secret.txt")}` }, resolveRealPath)).toEqual({
        action: "ask",
        reasons: ["outside-project"],
      });
    });

    it("asks for a new file whose parent is a symlink resolving outside the project", () => {
      const resolveRealPath = linkResolver({ [linked]: elsewhere });
      expect(decide("project-all", fileChange("linked/new/file.ts"), resolveRealPath)).toEqual({
        action: "ask",
        reasons: ["outside-project"],
      });
    });

    it("accepts a symlink that resolves back inside the project", () => {
      const resolveRealPath = linkResolver({ [linked]: join(projectRoot, "src") });
      expect(decide("safe-project", { command: "npm test", cwd: "linked" }, resolveRealPath)).toEqual({
        action: "accept",
        mode: "safe-project",
      });
    });
  });
});

function decide(
  mode: ApprovalPolicyMode,
  overrides: Partial<ApprovalAutomationRequest> = {},
  resolveRealPath: (absolutePath: string) => string = identity,
) {
  return decideApprovalAutomation({
    mode,
    request: { kind: "command", command: "npm test", cwd: ".", grantRoot: null, permissions: null, ...overrides },
    projectRoot,
    resolveRealPath,
  });
}

function fileChange(grantRoot: string | null): Partial<ApprovalAutomationRequest> {
  return { kind: "file-change", command: null, cwd: null, grantRoot };
}

function permissions(paths: { read?: string[]; write?: string[]; network?: boolean }) {
  return {
    fileSystem: { read: paths.read ?? [], write: paths.write ?? [] },
    network: paths.network ?? false,
  };
}

/** Maps each link path (and anything beneath it) to its target, the way a real symlink would. */
function linkResolver(links: Record<string, string>): (absolutePath: string) => string {
  const entries = Object.entries(links);
  return (absolutePath) => {
    for (const [from, to] of entries) {
      if (absolutePath === from || absolutePath.startsWith(`${from}${sep}`))
        return to + absolutePath.slice(from.length);
    }
    return absolutePath;
  };
}
