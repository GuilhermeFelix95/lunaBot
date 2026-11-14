// @vitest-environment node

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { developmentStatePaths, resetDevelopmentState, resolveDevelopmentAppDataRoot } from "./reset-dev-state";
import { DEVELOPMENT_SEED_MANIFEST_FILE } from "./seed-dev-state";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("reset dev state", () => {
  it("resolves the application data root for each supported platform", () => {
    expect(resolveDevelopmentAppDataRoot("darwin", {}, "/Users/tester").replaceAll("\\", "/")).toBe(
      "/Users/tester/Library/Application Support",
    );
    expect(resolveDevelopmentAppDataRoot("win32", { APPDATA: "C:\\Users\\tester\\AppData" })).toBe(
      "C:\\Users\\tester\\AppData",
    );
    expect(resolveDevelopmentAppDataRoot("linux", {}, "/home/tester").replaceAll("\\", "/")).toBe(
      "/home/tester/.config",
    );
    expect(resolveDevelopmentAppDataRoot("linux", { XDG_CONFIG_HOME: "/config" })).toBe("/config");
  });

  it("ignores a blank XDG_CONFIG_HOME on Linux and refuses unsupported platforms", () => {
    expect(
      resolveDevelopmentAppDataRoot("linux", { XDG_CONFIG_HOME: "   " }, "/home/tester").replaceAll("\\", "/"),
    ).toBe("/home/tester/.config");
    expect(() => resolveDevelopmentAppDataRoot("freebsd", {}, "/home/tester")).toThrow(
      "Unsupported development platform",
    );
  });

  it("deletes app and legacy host data but keeps production data", async () => {
    const appDataRoot = await makeTemporaryDirectory();
    const [appPath, legacyHostPath] = developmentStatePaths(appDataRoot);
    const productionPath = join(appDataRoot, "Luna Bot");

    await Promise.all([
      mkdir(appPath, { recursive: true }),
      mkdir(legacyHostPath, { recursive: true }),
      mkdir(productionPath, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(appPath, "lunabot.db"), "database"),
      writeFile(join(appPath, "lunabot.db-wal"), "wal"),
      writeFile(join(appPath, "lunabot.db-shm"), "shm"),
      writeFile(join(legacyHostPath, "lunabot.db"), "legacy host database"),
      writeFile(join(productionPath, "lunabot.db"), "production database"),
    ]);

    await expect(resetDevelopmentState(appDataRoot)).resolves.toEqual([appPath, legacyHostPath]);
    await expect(stat(appPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(legacyHostPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(productionPath, "lunabot.db"))).resolves.toBeDefined();
  });

  it("is idempotent when no development data exists", async () => {
    const appDataRoot = await makeTemporaryDirectory();

    await expect(resetDevelopmentState(appDataRoot)).resolves.toEqual([]);
  });

  it("removes seed-owned transfers but keeps other shared files", async () => {
    const root = await makeTemporaryDirectory();
    const appDataRoot = join(root, "app-data");
    const homeDirectory = join(root, "home");
    const [appPath] = developmentStatePaths(appDataRoot);
    const generatedRoot = join(homeDirectory, "Luna Bot", "Shared", "Transfers", "generated");
    const seedDirectory = join(generatedRoot, "de305d54-75b4-431b-adb2-eb6b9e546014");
    const sharedFile = join(homeDirectory, "Luna Bot", "Shared", "keep.txt");
    await Promise.all([mkdir(seedDirectory, { recursive: true }), mkdir(appPath, { recursive: true })]);
    await Promise.all([
      writeFile(join(seedDirectory, "seed.txt"), "seed"),
      writeFile(sharedFile, "keep"),
      writeFile(
        join(appPath, DEVELOPMENT_SEED_MANIFEST_FILE),
        JSON.stringify({
          version: 1,
          createdAt: "2026-08-21T10:00:00.000Z",
          transferDirectories: ["generated/de305d54-75b4-431b-adb2-eb6b9e546014"],
        }),
      ),
    ]);

    await resetDevelopmentState(appDataRoot, homeDirectory);

    await expect(stat(seedDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(sharedFile)).resolves.toBeDefined();
  });

  it("rejects a filesystem root", () => {
    expect(() => developmentStatePaths("/")).toThrow("The application data root cannot be a filesystem root.");
  });
});

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lunabot-dev-reset-"));
  temporaryDirectories.push(directory);
  return directory;
}
