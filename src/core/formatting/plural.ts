const RUSSIAN_PLURAL_RULES = new Intl.PluralRules("ru-RU");

/**
 * The Russian form that matches a count: 1 чек, 2 чека, 5 чеков. The categories come from Intl rather
 * than from modulo arithmetic copied into every screen that counts something.
 */
export function pluralRu(count: number, forms: { one: string; few: string; many: string }): string {
  const category = RUSSIAN_PLURAL_RULES.select(count);
  if (category === "one") return forms.one;
  if (category === "few") return forms.few;
  return forms.many;
}
