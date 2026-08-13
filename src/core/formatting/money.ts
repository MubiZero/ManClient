import { SettingsError } from "@/core/business-settings/settings-error";

export function parseSomoniToDiram(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new SettingsError("INVALID_AMOUNT");
  }
  const amountDiram = Math.round(Number(normalized) * 100);
  if (amountDiram < 1) throw new SettingsError("INVALID_AMOUNT");
  return amountDiram;
}

/**
 * The word people use, not the code banks use. ICU renders the TJS currency style as «99,00 TJS», and
 * a customer looking at a sum before transferring money reads that as a foreign abbreviation rather
 * than as somoni — it is the sort of detail nobody reports and everybody hesitates over.
 *
 * Tied to the number with a non-breaking space, which is also what the currency style produced: an
 * amount that wraps away from its unit at the edge of a narrow screen reads as a bare number.
 */
const CURRENCY_LABELS: Record<"ru-TJ" | "tg-TJ", string> = { "ru-TJ": "сомони", "tg-TJ": "сомонӣ" };

export function formatSomoni(amountDiram: number, locale: "ru-TJ" | "tg-TJ" = "ru-TJ"): string {
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountDiram / 100);
  return `${amount}\u00a0${CURRENCY_LABELS[locale]}`;
}
