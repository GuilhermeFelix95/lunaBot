import { describe, expect, it } from "vitest";
import { findLocalPaths, isSharedLocalPath } from "./local-paths";

describe("local paths in text", () => {
  it("finds Windows, home and posix paths and drops the punctuation after them", () => {
    const text = "Salvei em C:\\Users\\ana\\Docs\\plano.md, e em ~/LunaBot/Shared/notas.txt. Veja /home/ana/projeto/.";
    expect(findLocalPaths(text).map((mention) => mention.path)).toEqual([
      "C:\\Users\\ana\\Docs\\plano.md",
      "~/LunaBot/Shared/notas.txt",
      "/home/ana/projeto/",
    ]);
  });

  it("keeps a path whose folder names contain spaces, and stops before the prose after it", () => {
    const text = "Criei C:\\Users\\ana\\Luna Bot\\Bots\\builder\\relatorios e depois mais coisas.";
    expect(findLocalPaths(text).map((mention) => mention.path)).toEqual([
      "C:\\Users\\ana\\Luna Bot\\Bots\\builder\\relatorios",
    ]);
  });

  it("reports where each path sits in the text", () => {
    const text = "Abra C:\\temp\\a.txt agora";
    const [mention] = findLocalPaths(text);
    expect(text.slice(mention?.start, mention?.end)).toBe("C:\\temp\\a.txt");
  });

  it("leaves slash commands, fractions and web links alone", () => {
    expect(findLocalPaths("Use /compact ou sim/não, 1/2 e https://exemplo.com/a/b e C:\\")).toEqual([]);
  });

  it("recognises the shared area", () => {
    expect(isSharedLocalPath("~/LunaBot/Shared/x.md")).toBe(true);
    expect(isSharedLocalPath("C:\\Users\\ana\\LunaBot\\Shared\\x.md")).toBe(true);
    expect(isSharedLocalPath("C:\\Users\\ana\\Docs\\x.md")).toBe(false);
  });
});
