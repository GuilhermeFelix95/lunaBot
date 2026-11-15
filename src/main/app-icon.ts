import { join } from "node:path";
import type { AppVariant } from "@lunabot/contracts/ipc";

const APP_VARIANTS = ["production", "dev", "preview"] as const satisfies readonly AppVariant[];

export function readAppVariant(value: string | undefined, isPackaged: boolean): AppVariant {
  if (isAppVariant(value)) return value;
  return isPackaged ? "production" : "dev";
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
