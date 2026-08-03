import russian from "./ru.json";
import tajik from "./tg.json";

export const supportedLocales = ["ru", "tg"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof russian;

const dictionaries: Record<SupportedLocale, Record<TranslationKey, string>> = {
  ru: russian,
  tg: tajik,
};

/**
 * Looks up `key` in the dictionary for `locale`, falling back to the Russian
 * dictionary, and finally to the raw key itself if neither dictionary has an
 * entry (keeps the UI from crashing on a missing translation instead of
 * throwing).
 *
 * `params` are interpolated into `{name}` placeholders in the resolved
 * template, e.g. `t("ru", "payment.payCta", { amount: "120 сомони" })`.
 */
export function t(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[locale][key] ?? dictionaries.ru[key] ?? key;
  if (!params) return template;
  return Object.entries(params).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === "ru" || value === "tg";
}

/**
 * Resolves the effective public-page locale from an ordered list of
 * candidates (highest precedence first), e.g.
 * `resolveLocale([searchParams.lang, cookieValue, business.publicPageLocale])`.
 * Falls back to `"ru"` when nothing in the list is a supported locale.
 */
export function resolveLocale(candidates: Array<string | null | undefined>): SupportedLocale {
  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) return candidate;
  }
  return "ru";
}

export function intlLocale(locale: SupportedLocale): "ru-RU" | "tg-TJ" {
  return locale === "tg" ? "tg-TJ" : "ru-RU";
}

export function moneyLocale(locale: SupportedLocale): "ru-TJ" | "tg-TJ" {
  return locale === "tg" ? "tg-TJ" : "ru-TJ";
}
