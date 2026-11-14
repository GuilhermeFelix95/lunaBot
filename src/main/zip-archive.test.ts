// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { createExportArchive, writeZipArchive } from "./zip-archive";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("writeZipArchive", () => {
  it("writes a readable archive that keeps the folder name and file contents", async () => {
    const root = await temporaryDirectory();
    const exportRoot = join(root, "Luna Bot Backup");
    const large = Buffer.alloc(3 * 1024 * 1024, "lunabot-attachment-");
    await mkdir(join(exportRoot, "attachments", "nested"), { recursive: true });
    await writeFile(join(exportRoot, "lunabot-data.json"), '{"schemaVersion":3}\n');
    await writeFile(join(exportRoot, "attachments", "nested", "large.bin"), large);
    await writeFile(join(exportRoot, "attachments", "empty.txt"), "");
    const destination = join(root, "backup.zip");

    await writeZipArchive(exportRoot, destination);

    const entries = unzipSync(new Uint8Array(await readFile(destination)));
    expect(Object.keys(entries).sort()).toEqual([
      "Luna Bot Backup/attachments/empty.txt",
      "Luna Bot Backup/attachments/nested/large.bin",
      "Luna Bot Backup/lunabot-data.json",
    ]);
    expect(Buffer.from(entries["Luna Bot Backup/attachments/nested/large.bin"]).equals(large)).toBe(true);
    expect(Buffer.from(entries["Luna Bot Backup/lunabot-data.json"]).toString("utf8")).toBe('{"schemaVersion":3}\n');
    expect(entries["Luna Bot Backup/attachments/empty.txt"]).toHaveLength(0);
  });

  it("rejects when the source folder is missing", async () => {
    const root = await temporaryDirectory();
    await expect(writeZipArchive(join(root, "missing"), join(root, "out.zip"))).rejects.toThrow();
  });
});

describe("createExportArchive", () => {
  it("uses the Node writer on Linux, so no system zip or ditto binary is needed", async () => {
    const root = await temporaryDirectory();
    const exportRoot = join(root, "Luna Bot Backup");
    await mkdir(join(exportRoot, "attachments"), { recursive: true });
    await writeFile(join(exportRoot, "lunabot-data.json"), "{}\n");
    await writeFile(join(exportRoot, "attachments", "note.txt"), "hello");
    const archive = join(root, "backup.zip.tmp");

    await createExportArchive(exportRoot, archive, "linux");

    const entries = unzipSync(new Uint8Array(await readFile(archive)));
    expect(Object.keys(entries).sort()).toEqual([
      "Luna Bot Backup/attachments/note.txt",
      "Luna Bot Backup/lunabot-data.json",
    ]);
    expect(Buffer.from(entries["Luna Bot Backup/attachments/note.txt"]).toString("utf8")).toBe("hello");
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lunabot-zip-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
