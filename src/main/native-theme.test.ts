import { describe, expect, it } from "vitest";
import { nativeAppearance, setNativeAppearance, windowBackgroundColor } from "./native-theme";

describe("windowBackgroundColor", () => {
  it("resolves auto and system the same way the renderer does", () => {
    expect(windowBackgroundColor({ theme: "auto", mode: "light" }, true)).toBe("#f4f1ea");
    expect(windowBackgroundColor({ theme: "auto", mode: "dark" }, false)).toBe("#0d0e0f");
    expect(windowBackgroundColor({ theme: "auto", mode: "system" }, true)).toBe("#0d0e0f");
    expect(windowBackgroundColor({ theme: "auto", mode: "system" }, false)).toBe("#f4f1ea");
  });

  it("uses the explicit mode over the OS scheme", () => {
    expect(windowBackgroundColor({ theme: "papel", mode: "dark" }, false)).toBe("#1a1815");
    expect(windowBackgroundColor({ theme: "eclipse", mode: "light" }, true)).toBe("#eef0f4");
    expect(windowBackgroundColor({ theme: "quadrante", mode: "dark" }, false)).toBe("#121416");
    expect(windowBackgroundColor({ theme: "quadrante", mode: "light" }, true)).toBe("#eceef0");
  });

  it("keeps the last appearance received from the renderer", () => {
    expect(nativeAppearance()).toEqual({ theme: "auto", mode: "system" });
    setNativeAppearance({ theme: "eclipse", mode: "dark" });
    expect(nativeAppearance()).toEqual({ theme: "eclipse", mode: "dark" });
    setNativeAppearance({ theme: "auto", mode: "system" });
  });
});
