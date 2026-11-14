import { afterEach, describe, expect, it, vi } from "vitest";
import { localePreference, resolveLocale, setLocalePreference, t } from "./index";

const STORAGE_KEY = "lunabot:locale";

afterEach(() => {
  vi.restoreAllMocks();
  setLocalePreference("en");
});

describe("resolveLocale", () => {
  it("maps system to pt-BR for any Portuguese variant and to en otherwise", () => {
    expect(resolveLocale("system", "pt-BR")).toBe("pt-BR");
    expect(resolveLocale("system", "pt-PT")).toBe("pt-BR");
    expect(resolveLocale("system", "pt")).toBe("pt-BR");
    expect(resolveLocale("system", "en-US")).toBe("en");
    expect(resolveLocale("system", "fr-FR")).toBe("en");
  });

  it("uses an explicit preference regardless of the system language", () => {
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale("pt-BR", "en-US")).toBe("pt-BR");
  });
});

describe("t", () => {
  it("returns the English text for the en locale", () => {
    expect(t("providers.retry")).toBe("Try again");
  });

  it("returns the pt-BR text for the pt-BR locale", () => {
    setLocalePreference("pt-BR");
    expect(t("providers.retry")).toBe("Tentar de novo");
  });

  it("interpolates named parameters", () => {
    expect(t("providers.retryNamed", { name: "Claude" })).toBe("Try Claude again");
    setLocalePreference("pt-BR");
    expect(t("providers.retryNamed", { name: "Claude" })).toBe("Tentar de novo Claude");
  });

  it("leaves placeholders without a matching parameter untouched", () => {
    expect(t("providers.retryNamed")).toBe("Try {name} again");
  });

  it("picks the plural form from Intl.PluralRules", () => {
    expect(t("example.items", { count: 1 })).toBe("1 item");
    expect(t("example.items", { count: 2 })).toBe("2 items");
  });

  it("falls back to en for a key missing from pt-BR", () => {
    setLocalePreference("pt-BR");
    expect(t("example.items", { count: 3 })).toBe("3 items");
  });

  it("returns the key itself when no locale defines it", () => {
    // @ts-expect-error deliberately outside TranslationKey to exercise the runtime fallback
    expect(t("not.a.real.key")).toBe("not.a.real.key");
  });
});

describe("setLocalePreference", () => {
  it("updates the reactive locale, the document language and localStorage", () => {
    setLocalePreference("pt-BR");

    expect(localePreference()).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("pt-BR");
  });

  it("still applies the choice when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => setLocalePreference("pt-BR")).not.toThrow();
    expect(t("providers.retry")).toBe("Tentar de novo");
  });

  it("reads the stored preference on initialization and ignores invalid values", async () => {
    setLocalePreference("pt-BR");
    vi.resetModules();
    const fresh = await import("./index");
    expect(fresh.localePreference()).toBe("pt-BR");

    window.localStorage.setItem(STORAGE_KEY, "klingon");
    vi.resetModules();
    const invalid = await import("./index");
    expect(invalid.localePreference()).toBe("system");
  });
});
