import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ThemeModule = typeof import("./theme");

const THEME_KEY = "lunabot:theme";
const MODE_KEY = "lunabot:mode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

type MediaListener = (event: { matches: boolean }) => void;

function stubSystemScheme(initiallyDark: boolean) {
  const listeners = new Set<MediaListener>();
  const query = {
    media: DARK_QUERY,
    matches: initiallyDark,
    addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
  };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => query) });
  return {
    change(dark: boolean) {
      query.matches = dark;
      for (const listener of listeners) listener({ matches: dark });
    },
  };
}

async function loadTheme(): Promise<ThemeModule> {
  vi.resetModules();
  return import("./theme");
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(window, "lunabot");
  window.localStorage.clear();
});

describe("resolveMode", () => {
  it("follows the OS scheme for system and ignores it for explicit modes", async () => {
    const { resolveMode } = await loadTheme();
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("maps auto to papel in light mode and eclipse in dark mode", async () => {
    const { resolveTheme } = await loadTheme();
    expect(resolveTheme("auto", "light")).toBe("papel");
    expect(resolveTheme("auto", "dark")).toBe("eclipse");
  });

  it("uses an explicit theme in either mode", async () => {
    const { resolveTheme } = await loadTheme();
    for (const mode of ["light", "dark"] as const) {
      expect(resolveTheme("papel", mode)).toBe("papel");
      expect(resolveTheme("eclipse", mode)).toBe("eclipse");
      expect(resolveTheme("quadrante", mode)).toBe("quadrante");
    }
  });
});

describe("applyTheme on the document", () => {
  it.each([
    ["papel", "light"],
    ["papel", "dark"],
    ["eclipse", "light"],
    ["eclipse", "dark"],
    ["quadrante", "light"],
    ["quadrante", "dark"],
  ] as const)("sets data-theme=%s data-mode=%s and color-scheme", async (theme, mode) => {
    const { setThemePreference, setModePreference } = await loadTheme();
    setThemePreference(theme);
    setModePreference(mode);
    const root = document.documentElement;
    expect(root.dataset.theme).toBe(theme);
    expect(root.dataset.mode).toBe(mode);
    expect(root.style.colorScheme).toBe(mode);
  });

  it("resolves auto with the mode preference and follows changes", async () => {
    const { setThemePreference, setModePreference } = await loadTheme();
    setThemePreference("auto");
    setModePreference("light");
    expect(document.documentElement.dataset.theme).toBe("papel");
    setModePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("eclipse");
  });

  it("updates the reactive signals", async () => {
    const {
      activeMode,
      activeTheme,
      activeAppearance,
      modePreference,
      setModePreference,
      setThemePreference,
      themePreference,
    } = await loadTheme();
    setThemePreference("quadrante");
    setModePreference("dark");
    expect(themePreference()).toBe("quadrante");
    expect(modePreference()).toBe("dark");
    expect(activeTheme()).toBe("quadrante");
    expect(activeMode()).toBe("dark");
    expect(activeAppearance()).toEqual({ theme: "quadrante", mode: "dark" });
  });
});

describe("persistence", () => {
  it("persists the theme under lunabot:theme and the mode under lunabot:mode", async () => {
    const { setThemePreference, setModePreference } = await loadTheme();
    setThemePreference("quadrante");
    setModePreference("light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("quadrante");
    expect(window.localStorage.getItem(MODE_KEY)).toBe("light");
  });

  it("still applies the choice when storage writes throw", async () => {
    const { setThemePreference, setModePreference, activeAppearance } = await loadTheme();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => setThemePreference("papel")).not.toThrow();
    expect(() => setModePreference("light")).not.toThrow();
    expect(activeAppearance()).toEqual({ theme: "papel", mode: "light" });
    expect(document.documentElement.dataset.theme).toBe("papel");
  });

  it("reads valid stored values on import", async () => {
    window.localStorage.setItem(THEME_KEY, "papel");
    window.localStorage.setItem(MODE_KEY, "light");
    const { themePreference, modePreference, activeAppearance } = await loadTheme();
    expect(themePreference()).toBe("papel");
    expect(modePreference()).toBe("light");
    expect(activeAppearance()).toEqual({ theme: "papel", mode: "light" });
    expect(document.documentElement.dataset.theme).toBe("papel");
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("reads the legacy system theme value as auto", async () => {
    window.localStorage.setItem(THEME_KEY, "system");
    stubSystemScheme(true);
    const { themePreference, activeAppearance } = await loadTheme();
    expect(themePreference()).toBe("auto");
    expect(activeAppearance()).toEqual({ theme: "eclipse", mode: "dark" });
  });

  it("falls back to auto and system for unknown stored values", async () => {
    window.localStorage.setItem(THEME_KEY, "neon");
    window.localStorage.setItem(MODE_KEY, "sepia");
    stubSystemScheme(false);
    const { themePreference, modePreference, activeAppearance } = await loadTheme();
    expect(themePreference()).toBe("auto");
    expect(modePreference()).toBe("system");
    expect(activeAppearance()).toEqual({ theme: "papel", mode: "light" });
  });

  it("falls back to auto and system when storage reads throw", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    stubSystemScheme(false);
    const { themePreference, modePreference } = await loadTheme();
    expect(themePreference()).toBe("auto");
    expect(modePreference()).toBe("system");
  });
});

describe("system mode", () => {
  it("follows the OS scheme when the mode is system", async () => {
    const system = stubSystemScheme(false);
    const { setThemePreference, setModePreference, activeAppearance } = await loadTheme();
    setThemePreference("auto");
    setModePreference("system");
    expect(activeAppearance()).toEqual({ theme: "papel", mode: "light" });

    system.change(true);
    expect(activeAppearance()).toEqual({ theme: "eclipse", mode: "dark" });
    expect(document.documentElement.dataset.theme).toBe("eclipse");
    expect(document.documentElement.dataset.mode).toBe("dark");

    system.change(false);
    expect(activeAppearance()).toEqual({ theme: "papel", mode: "light" });
    expect(document.documentElement.dataset.theme).toBe("papel");
  });

  it("keeps an explicit theme when the OS scheme changes", async () => {
    const system = stubSystemScheme(false);
    const { setThemePreference, setModePreference, activeAppearance } = await loadTheme();
    setThemePreference("quadrante");
    setModePreference("system");

    system.change(true);
    expect(activeAppearance()).toEqual({ theme: "quadrante", mode: "dark" });
    expect(document.documentElement.dataset.theme).toBe("quadrante");
  });

  it("ignores OS changes while the mode is explicit", async () => {
    const system = stubSystemScheme(false);
    const { setThemePreference, setModePreference, activeAppearance } = await loadTheme();
    setThemePreference("auto");
    setModePreference("light");

    system.change(true);
    expect(activeAppearance()).toEqual({ theme: "papel", mode: "light" });
  });
});

describe("native window sync", () => {
  it("sends the theme and mode preferences to the desktop shell", async () => {
    const setTheme = vi.fn(async () => undefined);
    Object.defineProperty(window, "lunabot", { configurable: true, value: { app: { setTheme } } });
    const { setThemePreference, setModePreference } = await loadTheme();

    setThemePreference("eclipse");
    expect(setTheme).toHaveBeenLastCalledWith({ theme: "eclipse", mode: "system" });

    setModePreference("dark");
    expect(setTheme).toHaveBeenLastCalledWith({ theme: "eclipse", mode: "dark" });
  });
});
