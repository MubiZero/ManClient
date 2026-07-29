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

export function formatSomoni(amountDiram: number, locale: "ru-TJ" | "tg-TJ" = "ru-TJ"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "TJS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountDiram / 100);
}
