import { describe, expect, it } from "vitest";
import { appIconFileName, readAppVariant, resolveAppIconPath } from "./app-icon";

describe("app icon variant", () => {
  it("defaults to dev for an unpackaged app and production for a packaged app", () => {
    expect(readAppVariant(undefined, false)).toBe("dev");
    expect(readAppVariant(undefined, true)).toBe("production");
  });

  it("accepts explicit dev, preview, and production variants", () => {
    expect(readAppVariant("dev", true)).toBe("dev");
    expect(readAppVariant("preview", false)).toBe("preview");
    expect(readAppVariant("production", false)).toBe("production");
  });

  it("falls back safely for unknown values", () => {
    expect(readAppVariant("staging", false)).toBe("dev");
    expect(readAppVariant("staging", true)).toBe("production");
  });

  it("resolves source and packaged icon paths", () => {
    expect(appIconFileName("preview", "win32")).toBe("icon-preview.png");
    expect(appIconFileName("preview", "darwin")).toBe("icon-preview-macos-safe-area.png");
    expect(
      resolveAppIconPath({
        variant: "dev",
        platform: "win32",
        isPackaged: false,
        resourcesPath: "/Applications/LunaBot.app/Contents/Resources",
        sourceRoot: "/workspace/lunabot",
      }).replaceAll("\\", "/"),
    ).toBe("/workspace/lunabot/build/icon-dev.png");
    expect(
      resolveAppIconPath({
        variant: "production",
        platform: "darwin",
        isPackaged: true,
        resourcesPath: "/Applications/LunaBot.app/Contents/Resources",
        sourceRoot: "/workspace/lunabot",
      }).replaceAll("\\", "/"),
    ).toBe("/Applications/LunaBot.app/Contents/Resources/icons/icon-production-macos-safe-area.png");
  });
});
