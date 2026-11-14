import { describe, expect, it } from "vitest";
import { fallbackDesktopPlatform, platformLayout } from "./platform-layout";

describe("platformLayout", () => {
  it.each([
    ["win32", { withLeadingColumn: true, macOSChrome: false }],
    ["linux", { withLeadingColumn: true, macOSChrome: false }],
    ["darwin", { withLeadingColumn: true, macOSChrome: true }],
  ] as const)("gives %s the expected layout", (platform, expected) => {
    expect(platformLayout(platform)).toEqual(expected);
  });

  it("keeps the leading column off until the platform is known", () => {
    expect(platformLayout(null)).toEqual({ withLeadingColumn: false, macOSChrome: false });
    expect(platformLayout(undefined)).toEqual({ withLeadingColumn: false, macOSChrome: false });
  });

  it("makes Linux layout identical to Windows", () => {
    expect(platformLayout("linux")).toEqual(platformLayout("win32"));
  });
});

describe("fallbackDesktopPlatform", () => {
  it.each([
    ["Linux x86_64 X11 Electron", "linux"],
    ["Linux", "linux"],
    ["MacIntel Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", "darwin"],
    ["Win32 Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "win32"],
    ["", "win32"],
  ] as const)("resolves %j to %s without throwing", (identity, expected) => {
    expect(fallbackDesktopPlatform(identity)).toBe(expected);
  });
});
