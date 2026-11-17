// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATTACHMENT_LIMITS } from "@lunabot/contracts/input-limits";
import { afterEach, describe, expect, it } from "vitest";
import { filePreviewFromBytes, localDirectoryPreview, localFilePreview, mimeTypeForName } from "./file-preview";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("file previews", () => {
  it("classifies Markdown, common source files, images, and PDFs", () => {
    expect(filePreviewFromBytes("recipe.md", new Uint8Array([35]))).toMatchObject({
      mimeType: "text/markdown",
      previewKind: "markdown",
    });
    expect(filePreviewFromBytes("main.py", new Uint8Array([1]))).toMatchObject({ previewKind: "text" });
    expect(filePreviewFromBytes("photo.webp", new Uint8Array([1]))).toMatchObject({
      mimeType: "image/webp",
      previewKind: "image",
    });
    expect(filePreviewFromBytes("report.pdf", new Uint8Array([1]))).toMatchObject({ previewKind: "pdf" });
    expect(filePreviewFromBytes("reels-v4.mp4", new Uint8Array([1]))).toMatchObject({
      mimeType: "video/mp4",
      previewKind: "video",
    });
    expect(mimeTypeForName("Dockerfile")).toBe("text/plain");
  });

  it("does not transfer bytes for unsupported local files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lunabot-file-preview-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "archive.zip");
    await writeFile(path, new Uint8Array([1, 2, 3]));

    await expect(localFilePreview(path, "archive.zip", 3)).resolves.toEqual({
      name: "archive.zip",
      size: 3,
      mimeType: "application/octet-stream",
      previewKind: "none",
      bytes: null,
    });
  });

  it("rejects oversized previews before reading local content", async () => {
    await expect(
      localFilePreview("/does/not/need/to/exist", "large.txt", ATTACHMENT_LIMITS.fileBytes + 1),
    ).rejects.toThrow("100 MB");
  });

  it("lists a folder with its subfolders first and ignores nothing but special files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lunabot-folder-preview-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "zeta"));
    await mkdir(join(directory, "alpha"));
    await writeFile(join(directory, "b.txt"), "b");
    await writeFile(join(directory, "a.md"), "a");

    await expect(localDirectoryPreview(directory, "docs")).resolves.toMatchObject({
      name: "docs",
      previewKind: "directory",
      bytes: null,
      entriesTruncated: false,
      entries: [
        { name: "alpha", kind: "directory" },
        { name: "zeta", kind: "directory" },
        { name: "a.md", kind: "file" },
        { name: "b.txt", kind: "file" },
      ],
    });
  });
});
