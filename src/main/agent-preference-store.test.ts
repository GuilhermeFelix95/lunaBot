// @vitest-environment node

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAgentPreferences, updateAgentPreferences } from "./agent-preference-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agent preference store", () => {
  it("uses the default memory limit and no compaction window when nothing is stored", async () => {
    const root = await temporaryRoot();
    await expect(readAgentPreferences(join(root, "agent.json"))).resolves.toEqual({
      memoryLimit: 64,
      claudeCompactWindow: 200_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
  });

  it("falls back to defaults field by field when stored values are out of range", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");
    await writeFile(path, '{"version":1,"memoryLimit":100,"claudeCompactWindow":2000000}\n');
    await expect(readAgentPreferences(path)).resolves.toEqual({
      memoryLimit: 64,
      claudeCompactWindow: 200_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
  });

  it("keeps valid stored values even when the other field is malformed", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");
    await writeFile(path, '{"version":1,"memoryLimit":256,"claudeCompactWindow":"big"}\n');
    await expect(readAgentPreferences(path)).resolves.toEqual({
      memoryLimit: 256,
      claudeCompactWindow: 200_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
  });

  it("falls back to defaults when the file is not valid JSON or has an unknown version", async () => {
    const root = await temporaryRoot();
    const broken = join(root, "broken.json");
    const unknownVersion = join(root, "version.json");
    await writeFile(broken, "{ truncated");
    await writeFile(unknownVersion, '{"version":2,"memoryLimit":512}\n');
    await expect(readAgentPreferences(broken)).resolves.toEqual({
      memoryLimit: 64,
      claudeCompactWindow: 200_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
    await expect(readAgentPreferences(unknownVersion)).resolves.toEqual({
      memoryLimit: 64,
      claudeCompactWindow: 200_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
  });

  it("persists a single field without dropping the other one", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");
    await updateAgentPreferences(path, { claudeCompactWindow: 400_000 });
    await expect(updateAgentPreferences(path, { memoryLimit: 512 })).resolves.toEqual({
      memoryLimit: 512,
      claudeCompactWindow: 400_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
    await expect(readAgentPreferences(path)).resolves.toEqual({
      memoryLimit: 512,
      claudeCompactWindow: 400_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
    expect((await readdir(root)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it("clears a stored compaction window back to unset", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");
    await updateAgentPreferences(path, { claudeCompactWindow: 100_000 });
    await updateAgentPreferences(path, { claudeCompactWindow: null });
    await expect(readAgentPreferences(path)).resolves.toEqual({
      memoryLimit: 64,
      claudeCompactWindow: 200_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
  });

  it("keeps every field from overlapping updates", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");

    // Each update reads the file before writing, so without serialization two of them could both start
    // from the old file and the later rename would drop the other field.
    await Promise.all([
      updateAgentPreferences(path, { memoryLimit: 128 }),
      updateAgentPreferences(path, { claudeCompactWindow: 600_000 }),
      updateAgentPreferences(path, { memoryLimit: 256 }),
    ]);

    await expect(readAgentPreferences(path)).resolves.toEqual({
      memoryLimit: 256,
      claudeCompactWindow: 600_000,
      busyMessageMode: "queue",
      windowCloseBehavior: "ask",
    });
  });

  it("keeps a stored steer choice through unrelated updates and falls back to queue for unknown values", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");
    await expect(updateAgentPreferences(path, { busyMessageMode: "steer" })).resolves.toMatchObject({
      busyMessageMode: "steer",
    });
    await updateAgentPreferences(path, { memoryLimit: 256 });
    await expect(readAgentPreferences(path)).resolves.toMatchObject({ busyMessageMode: "steer", memoryLimit: 256 });

    await writeFile(path, '{"version":1,"memoryLimit":256,"claudeCompactWindow":null,"busyMessageMode":"interrupt"}\n');
    await expect(readAgentPreferences(path)).resolves.toMatchObject({ busyMessageMode: "queue", memoryLimit: 256 });
  });

  it("persists the window close choice and falls back to ask for unknown values", async () => {
    const root = await temporaryRoot();
    const path = join(root, "agent.json");
    await updateAgentPreferences(path, { windowCloseBehavior: "keep" });
    await updateAgentPreferences(path, { memoryLimit: 128 });
    await expect(readAgentPreferences(path)).resolves.toMatchObject({ windowCloseBehavior: "keep", memoryLimit: 128 });

    await writeFile(path, '{"version":1,"windowCloseBehavior":"minimize"}\n');
    await expect(readAgentPreferences(path)).resolves.toMatchObject({ windowCloseBehavior: "ask" });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lunabot-agent-preference-"));
  roots.push(root);
  await mkdir(root, { recursive: true });
  return root;
}
