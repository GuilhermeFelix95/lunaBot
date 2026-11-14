import { createSignal, flush } from "solid-js";
import { en, type MessageKey } from "./locales/en";
import { ptBR } from "./locales/pt-BR";

export type LocalePreference = "system" | "en" | "pt-BR";
export type Locale = "en" | "pt-BR";

export const LOCALE_PREFERENCES: LocalePreference[] = ["system", "en", "pt-BR"];

const STORAGE_KEY = "lunabot:locale";

type PluralBase<Key extends string> = Key extends `${infer Base}.one` ? Base : never;
export type TranslationKey = MessageKey | PluralBase<MessageKey>;

export type TranslationParams = { count?: number; [name: string]: string | number | undefined };

const messages: Record<Locale, Partial<Record<MessageKey, string>>> = { en, "pt-BR": ptBR };

export function resolveLocale(preference: LocalePreference, systemLanguage: string): Locale {
  if (preference !== "system") return preference;
  return /^pt(-|$)/i.test(systemLanguage) ? "pt-BR" : "en";
}

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key);
}

function lookup(locale: Locale, key: string): string | undefined {
  if (!isMessageKey(key)) return undefined;
  return messages[locale][key] ?? en[key];
}

function interpolate(template: string, params: TranslationParams | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  const current = locale();
  const count = params?.count;
  const pluralKey = count === undefined ? undefined : `${key}.${new Intl.PluralRules(current).select(count)}`;
  const template = (pluralKey === undefined ? undefined : lookup(current, pluralKey)) ?? lookup(current, key) ?? key;
  return interpolate(template, params);
}

function readStoredPreference(): LocalePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LOCALE_PREFERENCES.find((option) => option === stored) ?? "system";
  } catch {
    return "system";
  }
}

const [preference, setPreference] = createSignal<LocalePreference>(readStoredPreference());
const [locale, setLocale] = createSignal<Locale>(resolveLocale(preference(), navigator.language));

export { locale, preference as localePreference };

function syncNativeLocale(next: Locale): void {
  try {
    void window.lunabot?.app.setLocale({ locale: next }).catch(() => undefined);
  } catch {
    // Outside the desktop shell (tests, previews) there is no native menu to sync.
  }
}

function applyLocale(next: LocalePreference): void {
  const resolved = resolveLocale(next, navigator.language);
  setPreference(next);
  setLocale(resolved);
  // Solid 2 batches signal writes in a microtask; flush so reads see the new locale now.
  flush();
  document.documentElement.lang = resolved;
  syncNativeLocale(resolved);
}

export function setLocalePreference(next: LocalePreference): void {
  applyLocale(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage is unavailable; the choice still applies for this session.
  }
}

applyLocale(preference());
