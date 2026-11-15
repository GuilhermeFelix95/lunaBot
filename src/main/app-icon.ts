import { join } from "node:path";
import type { AppVariant } from "@lunabot/contracts/ipc";

const APP_VARIANTS = ["production", "dev", "preview"] as const satisfies readonly AppVariant[];

export function readAppVariant(value: string | undefined, isPackaged: boolean): AppVariant {
  if (isAppVariant(value)) return value;
  return isPackaged ? "production" : "dev";
}

/**
 * Windows toast notifications keep a Start Menu shortcut named after the app and rewrite it to point at the running
 * executable. The installer also opens the app through that shortcut after an update, so an unpackaged run sharing the
 * name would leave it pointing at the bare Electron and the update would open Electron's welcome screen.
 */
export function applicationName(isPackaged: boolean): "Luna Bot" | "Luna Bot Dev" {
  return isPackaged ? "Luna Bot" : "Luna Bot Dev";
}

/**
 * The Windows taskbar looks up a window's icon through the shortcut that carries the same AppUserModelID. The installer
 * writes the production id on its shortcuts, so an unpackaged run must use a different one, or its Electron shortcut
 * competes with the installed app's and the taskbar shows the Electron icon.
 */
export function windowsAppUserModelId(isPackaged: boolean): "app.lunabot.desktop" | "app.lunabot.desktop.dev" {
  return isPackaged ? "app.lunabot.desktop" : "app.lunabot.desktop.dev";
}

export function appIconFileName(variant: AppVariant, platform: NodeJS.Platform): string {
  return platform === "darwin" ? `icon-${variant}-macos-safe-area.png` : `icon-${variant}.png`;
}

export function resolveAppIconPath(options: {
  variant: AppVariant;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  resourcesPath: string;
  sourceRoot: string;
}): string {
  return options.isPackaged
    ? join(options.resourcesPath, "icons", appIconFileName(options.variant, options.platform))
    : join(options.sourceRoot, "build", appIconFileName(options.variant, options.platform));
}

function isAppVariant(value: string | undefined): value is AppVariant {
  return APP_VARIANTS.some((variant) => variant === value);
}
