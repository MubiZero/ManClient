import russian from "./ru.json";
import tajik from "./tg.json";

export const supportedLocales = ["ru", "tg"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof russian;

const dictionaries: Record<SupportedLocale, Record<TranslationKey, string>> = {
  ru: russian,
  tg: tajik,
};

export function t(locale: SupportedLocale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries.ru[key];
}
