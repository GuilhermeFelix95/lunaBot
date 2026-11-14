import type { AppMode, AppTheme } from "@lunabot/contracts/ipc";

export interface NativeAppearance {
  theme: AppTheme;
  mode: AppMode;
}

// Must match --lunabot-paper in src/renderer/src/styles.css for each theme and resolved mode.
const PAPER: Record<Exclude<AppTheme, "auto">, Record<"light" | "dark", string>> = {
  papel: { light: "#f4f1ea", dark: "#1a1815" },
  eclipse: { light: "#eef0f4", dark: "#0d0e0f" },
  quadrante: { light: "#eceef0", dark: "#121416" },
};

export const DEFAULT_NATIVE_APPEARANCE: NativeAppearance = { theme: "auto", mode: "system" };

// Last appearance the renderer sent, or the one stored on disk at startup; new windows start from it.
let appearance: NativeAppearance = { ...DEFAULT_NATIVE_APPEARANCE };

export function setNativeAppearance(next: NativeAppearance): void {
  appearance = next;
}

export function nativeAppearance(): NativeAppearance {
  return appearance;
}

/** Window background for an appearance. auto and system resolve the same way the renderer does. */
export function windowBackgroundColor(next: NativeAppearance, systemPrefersDark: boolean): string {
  const dark = next.mode === "system" ? systemPrefersDark : next.mode === "dark";
  const theme = next.theme === "auto" ? (dark ? "eclipse" : "papel") : next.theme;
  return PAPER[theme][dark ? "dark" : "light"];
}
