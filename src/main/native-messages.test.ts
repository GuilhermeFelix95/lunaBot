import { describe, expect, it } from "vitest";
import { EN, nativeMessage, PT_BR, resolveNativeLocale, setNativeLocale } from "./native-messages";

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("native messages", () => {
  it("resolves pt-BR system locales and falls back to English", () => {
    expect(resolveNativeLocale("pt-BR")).toBe("pt-BR");
    expect(resolveNativeLocale("pt")).toBe("pt-BR");
    expect(resolveNativeLocale("en-US")).toBe("en");
    expect(resolveNativeLocale("fr-FR")).toBe("en");
  });

  it("substitutes placeholders in both locales", () => {
    setNativeLocale("en");
    expect(nativeMessage("errors.input.required", { label: "Name" })).toBe("Name is required.");
    setNativeLocale("pt-BR");
    expect(nativeMessage("errors.input.required", { label: "Nome" })).toBe("Nome é obrigatório.");
    setNativeLocale("en");
  });

  it("has a pt-BR message for every en key and no extra pt-BR keys", () => {
    const english: Record<string, string> = EN;
    const portuguese: Record<string, string> = PT_BR;
    expect(Object.keys(portuguese).filter((key) => !(key in english))).toEqual([]);
    expect(Object.keys(english).filter((key) => !(key in portuguese))).toEqual([]);
  });

  it("uses the same placeholders in pt-BR as in en for every key", () => {
    const english: Record<string, string> = EN;
    const portuguese: Record<string, string> = PT_BR;
    const mismatches = Object.keys(english).filter((key) => {
      const englishPlaceholders = placeholdersOf(english[key] ?? "");
      const portuguesePlaceholders = placeholdersOf(portuguese[key] ?? "");
      return englishPlaceholders.join(",") !== portuguesePlaceholders.join(",");
    });
    expect(mismatches).toEqual([]);
  });
});
