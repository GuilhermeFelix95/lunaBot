import { createSignal, flush } from "solid-js";

export type ThemePreference = "auto" | "papel" | "eclipse" | "quadrante";
export type ResolvedTheme = Exclude<ThemePreference, "auto">;
export type ModePreference = "system" | "light" | "dark";
export type ResolvedMode = Exclude<ModePreference, "system">;
export type ResolvedAppearance = { theme: ResolvedTheme; mode: ResolvedMode };

export const THEME_PREFERENCES: ThemePreference[] = ["auto", "papel", "eclipse", "quadrante"];
export const MODE_PREFERENCES: ModePreference[] = ["system", "light", "dark"];

const THEME_STORAGE_KEY = "lunabot:theme";
const MODE_STORAGE_KEY = "lunabot:mode";
const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function resolveMode(preference: ModePreference, prefersDark: boolean): ResolvedMode {
  if (preference !== "system") return preference;
  return prefersDark ? "dark" : "light";
}

/** auto follows the mode: Papel when light, Eclipse when dark. Explicit themes ignore the mode. */
export function resolveTheme(preference: ThemePreference, mode: ResolvedMode): ResolvedTheme {
  if (preference !== "auto") return preference;
  return mode === "dark" ? "eclipse" : "papel";
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    // "system" was the pre-mode name for auto; keep it readable.
    if (stored === "system") return "auto";
    return THEME_PREFERENCES.find((option) => option === stored) ?? "auto";
  } catch {
    return "auto";
  }
}

function readStoredMode(): ModePreference {
  try {
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return MODE_PREFERENCES.find((option) => option === stored) ?? "system";
  } catch {
    return "system";
  }
}

const darkSchemeQuery = window.matchMedia?.(DARK_SCHEME_QUERY);

const [themePreference, setThemePreferenceSignal] = createSignal<ThemePreference>(readStoredTheme());
const [modePreference, setModePreferenceSignal] = createSignal<ModePreference>(readStoredMode());
const [systemPrefersDark, setSystemPrefersDark] = createSignal(darkSchemeQuery?.matches ?? false);
const [activeMode, setActiveMode] = createSignal<ResolvedMode>(resolveMode(modePreference(), systemPrefersDark()));
const [activeTheme, setActiveTheme] = createSignal<ResolvedTheme>(resolveTheme(themePreference(), activeMode()));

export { activeMode, activeTheme, modePreference, themePreference };

export function activeAppearance(): ResolvedAppearance {
  return { theme: activeTheme(), mode: activeMode() };
}

function themeColorMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  return meta;
}

function syncNativeTheme(): void {
  try {
    void window.lunabot?.app.setTheme({ theme: themePreference(), mode: modePreference() }).catch(() => undefined);
  } catch {
    // Outside the desktop shell (tests, previews) there is no native window to sync.
  }
}

export function applyTheme(): void {
  const mode = resolveMode(modePreference(), systemPrefersDark());
  const theme = resolveTheme(themePreference(), mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  setActiveMode(mode);
  setActiveTheme(theme);
  // Solid 2 batches signal writes in a microtask; flush so reads see the new theme now.
  flush();
  const paper = getComputedStyle(root).getPropertyValue("--lunabot-paper").trim();
  if (paper) themeColorMeta().content = paper;
  syncNativeTheme();
}

export function setThemePreference(next: ThemePreference): void {
  setThemePreferenceSignal(next);
  // Flush first so applyTheme reads the new preference.
  flush();
  applyTheme();
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage is unavailable; the choice still applies for this session.
  }
}

export function setModePreference(next: ModePreference): void {
  setModePreferenceSignal(next);
  flush();
  applyTheme();
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, next);
  } catch {
    // Storage is unavailable; the choice still applies for this session.
  }
}

/** The theme the OS currently resolves to with auto, used to preview the Tema option. */
darkSchemeQuery?.addEventListener("change", (event) => {
  setSystemPrefersDark(event.matches);
  flush();
  applyTheme();
});

applyTheme();
