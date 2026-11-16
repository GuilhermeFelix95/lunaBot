import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit";

// Bump when the patch logic changes so existing copies are rebuilt.
const PATCH_REVISION = 2;
// Windows names the Start menu shortcut that notifications write after this resource, so it must differ from the installed app.
export const DEV_ELECTRON_PRODUCT_NAME = "Luna Bot Dev";
const MARKER_FILE = "lunabot-dev-marker.txt";

export interface DevElectronIdentity {
  electronVersion: string;
  iconSha256: string;
}

export interface WindowsDevElectronInput {
  platform: NodeJS.Platform;
  projectRoot: string;
  warn: (message: string) => void;
}

export function devElectronMarker(identity: DevElectronIdentity): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        patchRevision: PATCH_REVISION,
        productName: DEV_ELECTRON_PRODUCT_NAME,
        electronVersion: identity.electronVersion,
        iconSha256: identity.iconSha256,
      }),
    )
    .digest("hex");
}

export function shouldRebuildDevElectron(input: {
  storedMarker: string | undefined;
  expectedMarker: string;
  executableExists: boolean;
}): boolean {
  return !input.executableExists || input.storedMarker !== input.expectedMarker;
}

// Returns the patched executable path on Windows, or undefined so the caller keeps the stock Electron binary.
export function resolveWindowsDevElectron(input: WindowsDevElectronInput): string | undefined {
  if (input.platform !== "win32") return undefined;
  try {
    return ensureWindowsDevElectron(input.projectRoot);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    input.warn(`Could not prepare the Luna Bot dev icon copy; using the stock Electron icon. ${reason}`);
    return undefined;
  }
}

function ensureWindowsDevElectron(projectRoot: string): string {
  const distDirectory = join(projectRoot, "node_modules", "electron", "dist");
  const iconPath = join(projectRoot, "build", "icon-dev.ico");
  const iconBytes = readFileSync(iconPath);
  const expectedMarker = devElectronMarker({
    electronVersion: readElectronVersion(projectRoot),
    iconSha256: sha256(iconBytes),
  });

  const copyDirectory = join(projectRoot, "node_modules", ".cache", "lunabot-dev-electron");
  const executable = join(copyDirectory, "electron.exe");
  const markerPath = join(copyDirectory, MARKER_FILE);
  const storedMarker = existsSync(markerPath) ? readFileSync(markerPath, "utf8").trim() : undefined;
  if (!shouldRebuildDevElectron({ storedMarker, expectedMarker, executableExists: existsSync(executable) })) {
    return executable;
  }

  // Build in a staging folder and swap it in, so a half-copied folder is never used.
  const staging = `${copyDirectory}.staging-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  try {
    cpSync(distDirectory, staging, { recursive: true });
    patchExecutable(join(staging, "electron.exe"), iconBytes);
    writeFileSync(join(staging, MARKER_FILE), expectedMarker);
    rmSync(copyDirectory, { recursive: true, force: true });
    mkdirSync(dirname(copyDirectory), { recursive: true });
    renameSync(staging, copyDirectory);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return executable;
}

function patchExecutable(executablePath: string, iconBytes: Buffer): void {
  const executable = NtExecutable.from(readFileSync(executablePath), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);

  const [iconGroup] = Resource.IconGroupEntry.fromEntries(resources.entries);
  if (!iconGroup) throw new Error("electron.exe has no icon group resource.");
  const iconFile = Data.IconFile.from(iconBytes);
  Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    iconGroup.id,
    iconGroup.lang,
    iconFile.icons.map((item) => item.data),
  );

  const [versionInfo] = Resource.VersionInfo.fromEntries(resources.entries);
  if (!versionInfo) throw new Error("electron.exe has no version resource.");
  for (const language of versionInfo.getAllLanguagesForStringValues()) {
    versionInfo.setStringValues(language, {
      ProductName: DEV_ELECTRON_PRODUCT_NAME,
      FileDescription: DEV_ELECTRON_PRODUCT_NAME,
    });
  }
  versionInfo.outputToResourceEntries(resources.entries);

  resources.outputResource(executable);
  writeFileSync(executablePath, Buffer.from(executable.generate()));
}

function readElectronVersion(projectRoot: string): string {
  const manifest: { version: string } = JSON.parse(
    readFileSync(join(projectRoot, "node_modules", "electron", "package.json"), "utf8"),
  );
  return manifest.version;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
