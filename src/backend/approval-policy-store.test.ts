// @vitest-environment node

import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readApprovalPolicies, realPathOrNearestAncestor, writeApprovalPolicies } from "./approval-policy-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("approval policy store", () => {
  it("returns an empty map when no policy file exists yet", async () => {
    const root = await temporaryRoot();
    await expect(readApprovalPolicies(join(root, "policy.json"))).resolves.toEqual(new Map());
  });

  it("round-trips per-agent modes and writes the versioned file", async () => {
    const root = await temporaryRoot();
    const path = join(root, "policy.json");
    const policies = new Map([
      ["bot-1", "safe-project"],
      ["bot-2", "project-all"],
    ] as const);

    await writeApprovalPolicies(path, policies);

    await expect(readApprovalPolicies(path)).resolves.toEqual(policies);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      version: 1,
      policies: { "bot-1": "safe-project", "bot-2": "project-all" },
    });
    expect((await readdir(root)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it("falls back to an empty map for corrupt JSON or an unknown version", async () => {
    const root = await temporaryRoot();
    const broken = join(root, "broken.json");
    const unknownVersion = join(root, "version.json");
    await writeFile(broken, "{ truncated");
    await writeFile(unknownVersion, '{"version":2,"policies":{"bot-1":"project-all"}}\n');

    await expect(readApprovalPolicies(broken)).resolves.toEqual(new Map());
    await expect(readApprovalPolicies(unknownVersion)).resolves.toEqual(new Map());
  });

  it("drops entries whose mode is not a known approval mode", async () => {
    const root = await temporaryRoot();
    const path = join(root, "policy.json");
    await writeFile(path, '{"version":1,"policies":{"bot-1":"project-all","bot-2":"yolo","bot-3":42,"bot-4":"ask"}}\n');

    await expect(readApprovalPolicies(path)).resolves.toEqual(
      new Map([
        ["bot-1", "project-all"],
        ["bot-4", "ask"],
      ]),
    );
  });

  it("returns an empty map when policies is not an object", async () => {
    const root = await temporaryRoot();
    const path = join(root, "policy.json");
    await writeFile(path, '{"version":1,"policies":["project-all"]}\n');

    await expect(readApprovalPolicies(path)).resolves.toEqual(new Map());
  });

  it("keeps the last write when writes are issued together", async () => {
    const root = await temporaryRoot();
    const path = join(root, "policy.json");

    // Without serialization a later rename could land before an earlier one and leave the older map on disk.
    await Promise.all([
      writeApprovalPolicies(path, new Map([["bot-1", "safe-project"]])),
      writeApprovalPolicies(path, new Map([["bot-1", "project-all"]])),
      writeApprovalPolicies(
        path,
        new Map([
          ["bot-1", "project-all"],
          ["bot-2", "safe-project"],
        ]),
      ),
    ]);

    await expect(readApprovalPolicies(path)).resolves.toEqual(
      new Map([
        ["bot-1", "project-all"],
        ["bot-2", "safe-project"],
      ]),
    );
    expect((await readdir(root)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it("resolves a missing child path through its nearest existing ancestor", async () => {
    const root = await temporaryRoot();
    const existing = realpathSync.native(root);

    expect(realPathOrNearestAncestor(join(root, "not", "created", "yet.ts"))).toBe(
      join(existing, "not", "created", "yet.ts"),
    );
    expect(realPathOrNearestAncestor(root)).toBe(existing);
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lunabot-approval-policy-"));
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}
