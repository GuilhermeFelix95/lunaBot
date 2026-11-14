import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type DevelopmentCommandRunner, prepareDevelopmentEnvironment } from "./prepare-dev-environment";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("development environment preparation", () => {
  it("installs dependencies with the frozen lockfile", () => {
    const root = createTemporaryRoot();
    const calls: string[][] = [];
    const run: DevelopmentCommandRunner = (_executable, args) => calls.push(args);

    prepareDevelopmentEnvironment({ projectRoot: root, executable: "bun", run });

    expect(calls).toEqual([["install", "--frozen-lockfile"]]);
  });
});

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lunabot-dev-prepare-"));
  temporaryRoots.push(root);
  return root;
}
