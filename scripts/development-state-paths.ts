import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDevelopmentAppDataRoot(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
): string {
  if (platform === "darwin") {
    return join(homeDirectory, "Library", "Application Support");
  }

  if (platform === "win32") {
    const appData = environment.APPDATA?.trim();
    if (!appData) {
      throw new Error("APPDATA is not set. Luna Bot dev state was not changed.");
    }
    return appData;
  }

  if (platform === "linux") {
    // Electron's appData on Linux follows XDG_CONFIG_HOME, defaulting to ~/.config.
    return environment.XDG_CONFIG_HOME?.trim() || join(homeDirectory, ".config");
  }

  throw new Error(`Unsupported development platform: ${platform}. Luna Bot dev state was not changed.`);
}
