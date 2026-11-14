import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { chmod, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Windows keeps SQLite -wal/-shm and freshly closed handles locked for a moment, so removal retries on EBUSY.
export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

let symlinkSupport: boolean | undefined;

// File symlinks need the Developer Mode or admin privilege on Windows; probe once instead of failing with EPERM.
export function canCreateSymlinks(): boolean {
  symlinkSupport ??= probeSymlinks();
  return symlinkSupport;
}

function probeSymlinks(): boolean {
  const directory = mkdtempSync(join(tmpdir(), "lunabot-symlink-probe-"));
  try {
    symlinkSync(join(directory, "target"), join(directory, "link"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Directory links use junctions on Windows because junctions do not require the symlink privilege.
export async function symlinkDirectory(target: string, path: string): Promise<void> {
  await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
}

// Windows cannot execute extensionless shebang scripts, so the fixture gets a .cmd launcher that runs node.
export async function writeNodeExecutable(
  directory: string,
  name: string,
  source: string,
  format: "cjs" | "esm",
): Promise<string> {
  if (process.platform !== "win32") {
    const executable = join(directory, name);
    await writeFile(executable, source, { mode: 0o700 });
    await chmod(executable, 0o700);
    return executable;
  }
  const script = join(directory, `${name}.${format === "esm" ? "mjs" : "cjs"}`);
  await writeFile(script, source);
  const launcher = join(directory, `${name}.cmd`);
  await writeFile(launcher, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  return launcher;
}
