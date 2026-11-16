import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEV_ELECTRON_PRODUCT_NAME,
  devElectronMarker,
  resolveWindowsDevElectron,
  shouldRebuildDevElectron,
} from "./windows-dev-electron";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Windows development Electron copy", () => {
  it("changes the marker when the Electron version or the icon changes", () => {
    const base = devElectronMarker({ electronVersion: "44.0.0", iconSha256: "a" });

    expect(devElectronMarker({ electronVersion: "44.0.0", iconSha256: "a" })).toBe(base);
    expect(devElectronMarker({ electronVersion: "45.0.0", iconSha256: "a" })).not.toBe(base);
    expect(devElectronMarker({ electronVersion: "44.0.0", iconSha256: "b" })).not.toBe(base);
  });

  it("names the copy differently from the installed app so notifications cannot overwrite its Start menu shortcut", () => {
    const builderConfig = readFileSync(join(__dirname, "..", "electron-builder.yml"), "utf8");
    const installedName = /^productName: (.+)$/mu.exec(builderConfig)?.[1]?.trim();

    expect(installedName).toBe("Luna Bot");
    expect(DEV_ELECTRON_PRODUCT_NAME).not.toBe(installedName);
    expect(devElectronMarker({ electronVersion: "44.0.0", iconSha256: "a" })).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rebuilds only when the copy is missing or its marker differs", () => {
    const expectedMarker = "current";

    expect(shouldRebuildDevElectron({ storedMarker: "current", expectedMarker, executableExists: true })).toBe(false);
    expect(shouldRebuildDevElectron({ storedMarker: undefined, expectedMarker, executableExists: true })).toBe(true);
    expect(shouldRebuildDevElectron({ storedMarker: "old", expectedMarker, executableExists: true })).toBe(true);
    expect(shouldRebuildDevElectron({ storedMarker: "current", expectedMarker, executableExists: false })).toBe(true);
  });

  it("leaves macOS and Linux on the stock Electron executable without touching the project", () => {
    const warnings: string[] = [];
    const missingRoot = join(tmpdir(), "lunabot-missing-root-that-must-not-exist");

    for (const platform of ["darwin", "linux"] as const) {
      expect(resolveWindowsDevElectron({ platform, projectRoot: missingRoot, warn: (m) => warnings.push(m) })).toBe(
        undefined,
      );
    }
    expect(warnings).toEqual([]);
  });

  it("falls back to the stock executable with a warning when the Electron package is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "lunabot-win-electron-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "build"));
    writeFileSync(join(root, "build", "icon-dev.ico"), Buffer.from([0, 0, 1, 0]));
    const warnings: string[] = [];

    const executable = resolveWindowsDevElectron({
      platform: "win32",
      projectRoot: root,
      warn: (message) => warnings.push(message),
    });

    expect(executable).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("stock Electron icon");
  });
});
