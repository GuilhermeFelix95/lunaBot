import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { finished } from "node:stream/promises";
import { promisify } from "node:util";
import { Zip, ZipDeflate } from "fflate";

const execFileAsync = promisify(execFile);

/** Zips `exportRoot` into `archiveCandidate`. Linux uses the Node writer, so no system `zip` binary is needed. */
export async function createExportArchive(
  exportRoot: string,
  archiveCandidate: string,
  platform: NodeJS.Platform,
): Promise<void> {
  if (platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -LiteralPath '${powerShellLiteral(exportRoot)}' -DestinationPath '${powerShellLiteral(archiveCandidate)}' -Force`,
    ]);
    return;
  }
  if (platform === "darwin") {
    await execFileAsync("/usr/bin/ditto", ["-c", "-k", "--keepParent", exportRoot, archiveCandidate]);
    return;
  }
  await writeZipArchive(exportRoot, archiveCandidate);
}

function powerShellLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Writes `sourceDirectory` as a ZIP archive whose entries sit under the directory's own name, like
 * `ditto --keepParent`. Files are streamed through deflate, so large attachments are not held in memory.
 */
export async function writeZipArchive(sourceDirectory: string, destination: string): Promise<void> {
  const rootName = basename(sourceDirectory);
  const files = await listFiles(sourceDirectory);
  const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  const closed = finished(output);
  closed.catch(() => undefined);

  try {
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        output.destroy(error);
        return;
      }
      if (chunk.byteLength > 0) output.write(chunk);
      if (final) output.end();
    });
    for (const relativePath of files) {
      const entry = new ZipDeflate(`${rootName}/${relativePath}`, { level: 6 });
      zip.add(entry);
      for await (const chunk of createReadStream(join(sourceDirectory, relativePath))) entry.push(chunk, false);
      entry.push(new Uint8Array(0), true);
    }
    zip.end();
    await closed;
  } catch (error) {
    output.destroy();
    throw error;
  }
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(directory, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}
