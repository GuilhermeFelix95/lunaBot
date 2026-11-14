// @vitest-environment node

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNativeAppearanceSync, writeNativeAppearanceSync } from "./native-appearance-store";
import { DEFAULT_NATIVE_APPEARANCE, windowBackgroundColor } from "./native-theme";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("native appearance store", () => {
  it("uses auto and system when no appearance file exists", async () => {
    const root = await temporaryRoot();
    expect(readNativeAppearanceSync(join(root, "appearance.json"))).toEqual(DEFAULT_NATIVE_APPEARANCE);
  });

  it("falls back to the default when the file is malformed, unversioned or holds unknown values", async () => {
    const root = await temporaryRoot();
    const path = join(root, "appearance.json");
    const cases = [
      "{ truncated",
      '{"version":1,"theme":"neon","mode":"dark"}\n',
      '{"version":1,"theme":"papel","mode":"sepia"}\n',
      '{"version":1,"theme":"papel"}\n',
      '{"theme":"papel","mode":"dark"}\n',
      '{"version":2,"theme":"papel","mode":"dark"}\n',
      '"papel"\n',
    ];
    for (const contents of cases) {
      await writeFile(path, contents);
      expect(readNativeAppearanceSync(path)).toEqual(DEFAULT_NATIVE_APPEARANCE);
    }
  });

  it("reads a valid appearance synchronously", async () => {
    const root = await temporaryRoot();
    const path = join(root, "appearance.json");
    await writeFile(path, '{"version":1,"theme":"quadrante","mode":"dark"}\n');
    expect(readNativeAppearanceSync(path)).toEqual({ theme: "quadrante", mode: "dark" });
  });

  it("persists the last appearance atomically without leaving temporary files", async () => {
    const root = await temporaryRoot();
    const path = join(root, "appearance.json");
    writeNativeAppearanceSync(path, { theme: "papel", mode: "light" });
    writeNativeAppearanceSync(path, { theme: "eclipse", mode: "dark" });
    expect(readNativeAppearanceSync(path)).toEqual({ theme: "eclipse", mode: "dark" });
    expect((await readdir(root)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });
});

describe("startup window background from the stored appearance", () => {
  it("paints the chosen theme's paper even when the OS is light and the stored mode is dark", async () => {
    const root = await temporaryRoot();
    const path = join(root, "appearance.json");
    await writeFile(path, '{"version":1,"theme":"papel","mode":"dark"}\n');
    // systemPrefersDark is false on purpose: the stored explicit mode must win over the OS scheme.
    expect(windowBackgroundColor(readNativeAppearanceSync(path), false)).toBe("#1a1815");
  });

  it("paints quadrante dark from the stored appearance under a light OS", async () => {
    const root = await temporaryRoot();
    const path = join(root, "appearance.json");
    await writeFile(path, '{"version":1,"theme":"quadrante","mode":"dark"}\n');
    expect(windowBackgroundColor(readNativeAppearanceSync(path), false)).toBe("#121416");
  });

  it("keeps the OS scheme for auto and system when nothing is stored", async () => {
    const root = await temporaryRoot();
    const appearance = readNativeAppearanceSync(join(root, "appearance.json"));
    expect(windowBackgroundColor(appearance, false)).toBe("#f4f1ea");
    expect(windowBackgroundColor(appearance, true)).toBe("#0d0e0f");
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lunabot-appearance-"));
  roots.push(root);
  return root;
}
