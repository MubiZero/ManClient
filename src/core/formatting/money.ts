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

/** Both separators Tajikistan writes money with — ours to decide rather than to look up. */
const GROUP_SEPARATOR = "\u00a0";
const DECIMAL_SEPARATOR = ",";

/** Grouped by threes from the right, the way the number is read aloud. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * The amount is composed rather than handed to `Intl`, because the runtimes disagree about Tajik and the
 * disagreement reached the customer. Chromium ships no `tg` data and falls back to `en-US`, so a price
 * the server wrote as «1 234 567,50 сомонӣ» came back from hydration as «1,234,567.50 сомонӣ» — American
 * separators on a Tajik page, and a mismatch that threw the booking form's subtree away to get there.
 * Node and Chromium agree on `ru`, so only Tajik was visibly wrong; the fix belongs to both, because how
 * this product writes money is a decision and not a lookup.
 *
 * Split with integer arithmetic: diram are whole, and dividing them by 100 first is how a price ends up
 * a hundredth short of itself.
 */
export function formatSomoni(amountDiram: number, locale: "ru-TJ" | "tg-TJ" = "ru-TJ"): string {
  const rounded = Math.round(amountDiram);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const major = groupThousands(String(Math.trunc(absolute / 100)));
  const minor = String(absolute % 100).padStart(2, "0");
  return `${sign}${major}${DECIMAL_SEPARATOR}${minor}${GROUP_SEPARATOR}${CURRENCY_LABELS[locale]}`;
}
