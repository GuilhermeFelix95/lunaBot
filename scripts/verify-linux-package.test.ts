// @vitest-environment node

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asarEntries,
  debControlProblems,
  type LinuxPackageInput,
  parseDebControl,
  REQUIRED_DEPENDS,
  verifyLinuxPackage,
} from "./verify-linux-package";

const VERSION = "0.4.3";
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

type AsarNode = { files?: Record<string, AsarNode>; size?: number; offset?: string };

function buildAsar(paths: string[], index: string): Buffer {
  const root: AsarNode = { files: {} };
  const content = Buffer.from(index);
  for (const path of ["main/index.js", ...paths]) {
    const parts = path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      node.files ??= {};
      node.files[part] ??= { files: {} };
      node = node.files[part];
    }
    node.files ??= {};
    const leaf = parts.at(-1) ?? "";
    node.files[leaf] = path === "main/index.js" ? { size: content.length, offset: "0" } : { size: 0, offset: "0" };
  }
  const json = Buffer.from(JSON.stringify(root));
  const header = Buffer.alloc(16);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(json.length + 8, 4);
  header.writeUInt32LE(json.length + 4, 8);
  header.writeUInt32LE(json.length, 12);
  return Buffer.concat([header, json, content]);
}

const VALID_CONTROL = [
  "new Debian package, version 2.0.",
  " Package: lunabot",
  `Version: ${VERSION}`,
  " Architecture: amd64",
  " Depends: libc6 (>= 2.31), libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0",
  " Description: Local-first desktop workspace",
  "  A local-first multi-agent desktop workspace.",
].join("\n");

interface PackageOptions {
  appImage?: boolean;
  control?: string;
  asarEntries?: string[];
  asarText?: string;
  whisper?: boolean;
  model?: boolean;
  unpackedSdkPackages?: string[];
  platform?: string;
}

async function createPackage(options: PackageOptions = {}): Promise<LinuxPackageInput> {
  const distPath = await mkdtemp(join(tmpdir(), "lunabot-linux-dist-"));
  temporaryPaths.push(distPath);
  if (options.appImage !== false) await writeFile(join(distPath, `Luna Bot-${VERSION}-x86_64.AppImage`), "");
  await writeFile(join(distPath, `Luna Bot-${VERSION}-amd64.deb`), "");

  const writeTree = (destination: string): void => {
    const resources = join(destination, "opt/Luna Bot/resources");
    const write = (path: string, content: Buffer | string): void => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    };
    write(join(destination, "usr/share/applications/lunabot.desktop"), "[Desktop Entry]\nName=Luna Bot\n");
    write(join(resources, "app.asar"), buildAsar(options.asarEntries ?? [], options.asarText ?? "run()"));
    if (options.whisper !== false) write(join(resources, "whisper/bin/whisper-cli"), "binary");
    if (options.model) write(join(resources, "whisper/model/ggml-medium-q5_0.bin"), "model");
    for (const name of options.unpackedSdkPackages ?? []) {
      write(join(resources, "app.asar.unpacked/node_modules/@anthropic-ai", name, "claude"), "binary");
    }
  };

  return {
    platform: options.platform ?? "linux",
    distPath,
    version: VERSION,
    inspectDeb: () => options.control ?? VALID_CONTROL,
    extractDeb: (_debPath, destination) => writeTree(destination),
    validateDesktopFile: () => undefined,
  };
}

describe("verifyLinuxPackage", () => {
  it("refuses to run outside Linux", async () => {
    const input = await createPackage({ platform: "win32" });
    await expect(verifyLinuxPackage(input)).rejects.toThrow("must run on Linux");
  });

  it("accepts a package that matches the Linux layout", async () => {
    const input = await createPackage();
    await expect(verifyLinuxPackage(input)).resolves.toBeUndefined();
  });

  it("requires the AppImage next to the deb", async () => {
    const input = await createPackage({ appImage: false });
    await expect(verifyLinuxPackage(input)).rejects.toThrow();
  });

  it("rejects a deb with the wrong architecture and a missing dependency", async () => {
    const control = VALID_CONTROL.replace("Architecture: amd64", "Architecture: arm64").replace(", libsecret-1-0", "");
    const input = await createPackage({ control });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/Architecture is arm64/u);
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/missing libsecret-1-0/u);
  });

  it("rejects Claude SDK packages for other platforms inside app.asar", async () => {
    const input = await createPackage({
      asarEntries: ["node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe"],
    });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/claude-agent-sdk-win32-x64/u);
  });

  it("rejects Claude SDK packages for other platforms in app.asar.unpacked", async () => {
    const input = await createPackage({ unpackedSdkPackages: ["claude-agent-sdk-darwin-arm64"] });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/claude-agent-sdk-darwin-arm64/u);
  });

  it("rejects the Linux Claude SDK package too, because provider runtimes are not bundled", async () => {
    const input = await createPackage({
      asarEntries: ["node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude"],
    });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/claude-agent-sdk-linux-x64/u);
  });

  it("rejects the forbidden name inside app.asar", async () => {
    const forbidden = ["Open", "Bot"].join("");
    const input = await createPackage({ asarText: `const title = '${forbidden}';` });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/forbidden text/u);
  });

  it("requires the Whisper executable", async () => {
    const input = await createPackage({ whisper: false });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/Whisper executable is missing/u);
  });

  it("rejects the on-demand Whisper model inside the application", async () => {
    const input = await createPackage({ model: true });
    await expect(verifyLinuxPackage(input)).rejects.toThrow(/on-demand Whisper model/u);
  });
});

describe("Linux package helpers", () => {
  it("parses dpkg-deb control fields and ignores description continuation lines", () => {
    const fields = parseDebControl(VALID_CONTROL);
    expect(fields.Package).toBe("lunabot");
    expect(fields.Version).toBe(VERSION);
    expect(fields.Architecture).toBe("amd64");
    expect(fields.Depends).toContain("libsecret-1-0");
  });

  it("accepts Depends entries with version constraints and reports every missing package", () => {
    expect(debControlProblems(parseDebControl(VALID_CONTROL), VERSION)).toEqual([]);
    const problems = debControlProblems({ Package: "lunabot", Version: VERSION, Architecture: "amd64" }, VERSION);
    expect(problems).toHaveLength(REQUIRED_DEPENDS.length);
  });

  it("lists nested asar entries, including directories", () => {
    const archive = buildAsar(["node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude"], "x");
    expect(asarEntries(archive)).toEqual(
      expect.arrayContaining([
        "main",
        "main/index.js",
        "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64",
        "node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude",
      ]),
    );
  });
});
