import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ptBR } from "./pt-BR";

// Sample plural keys that exist only to exercise fallback and plural selection in index.test.ts.
const SAMPLE_KEY_PREFIX = "example.";

describe("locale catalogs", () => {
  it("has a pt-BR message for every en key", () => {
    const missing = Object.keys(en).filter((key) => !key.startsWith(SAMPLE_KEY_PREFIX) && !Object.hasOwn(ptBR, key));
    expect(missing).toEqual([]);
  });

  it("has no pt-BR key that en does not define", () => {
    const extra = Object.keys(ptBR).filter((key) => !Object.hasOwn(en, key));
    expect(extra).toEqual([]);
  });
});
