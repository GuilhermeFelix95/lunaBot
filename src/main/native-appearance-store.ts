import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { APP_MODES, APP_THEMES } from "@lunabot/contracts/ipc";
import { isDynamicRecord } from "@lunabot/contracts/runtime-values";
import { DEFAULT_NATIVE_APPEARANCE, type NativeAppearance } from "./native-theme";

/**
 * Read synchronously because it runs before the first BrowserWindow is created: the window's
 * backgroundColor and nativeTheme.themeSource must already match the last appearance, or the
 * window paints the default background first.
 */
export function readNativeAppearanceSync(path: string): NativeAppearance {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!isDynamicRecord(parsed) || parsed.version !== 1) return { ...DEFAULT_NATIVE_APPEARANCE };
    const theme = APP_THEMES.find((option) => option === parsed.theme);
    const mode = APP_MODES.find((option) => option === parsed.mode);
    if (!theme || !mode) return { ...DEFAULT_NATIVE_APPEARANCE };
    return { theme, mode };
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return { ...DEFAULT_NATIVE_APPEARANCE };
    throw error;
  }
}

/** Synchronous so that two quick IPC calls land in order; each one renames its own temporary file. */
export function writeNativeAppearanceSync(path: string, appearance: NativeAppearance): void {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, ...appearance })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
