import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isString } from "@lunabot/contracts/runtime-values";

/**
 * Bot ids that had background tasks running when the app last wrote this file.
 * An empty list removes the file. Startup reads the list, marks those bots as interrupted, and clears it.
 */
export class BackgroundTaskJournal {
  readonly #path: string;
  #writes: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async read(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await readFile(this.#path, "utf8"));
      return Array.isArray(parsed) ? parsed.filter(isString) : [];
    } catch {
      // A missing or unreadable journal must not block startup. The interruption note is best effort.
      return [];
    }
  }

  write(botIds: readonly string[]): Promise<void> {
    // Writes run one at a time so an older list can never replace a newer one.
    const next = this.#writes.then(() => this.#commit(botIds));
    this.#writes = next.catch(() => undefined);
    return next;
  }

  async #commit(botIds: readonly string[]): Promise<void> {
    if (botIds.length === 0) {
      await rm(this.#path, { force: true });
      return;
    }
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(botIds)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.#path);
  }
}
