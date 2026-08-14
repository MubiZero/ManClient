import { describe, expect, it } from "vitest";

import { buildPayomVariables } from "@/integrations/payom/payom-templates";

/**
 * Payom bills per segment — it counts them as "сообщений" and charges 0,045 сомони each — and a Cyrillic
 * SMS holds 70 characters per segment. Every notification therefore has to fit in one, or a salon with a
 * long name quietly pays twice for half of its messages, and the SMS ledger counts one where two were
 * bought.
 */
describe("SMS segment budget", () => {
  const startsAt = new Date("2026-08-05T09:30:00.000Z");
  const KINDS = ["BOOKING_CONFIRMATION", "BOOKING_REMINDER", "BOOKING_CANCELLED", "PAYMENT_REJECTED", "WAITLIST_SLOT_FREED"] as const;
  // The approved wording of each template, kept here so the assertion measures the delivered text rather
  // than trusting the same table it is checking.
  const APPROVED: Record<string, Record<string, string>> = {
    BOOKING_CONFIRMATION: { ru: "{text-1}: запись на {date-1}, {time-1} подтверждена", tg: "{text-1}: сабт санаи {date-1} в соати {time-1} тасдиқ шуд" },
    BOOKING_REMINDER: { ru: "{text-1}: ждём вас {date-1} в {time-1}", tg: "{text-1}: сабти шумо {date-1} соати {time-1}" },
    BOOKING_CANCELLED: { ru: "{text-1}: запись на {date-1} в {time-1} отменена", tg: "{text-1}: сабт барои {date-1} {time-1} бекор шуд" },
    PAYMENT_REJECTED: { ru: "{text-1}: чек по записи {date-1} не принят", tg: "{text-1}: расиди сабти {date-1} тасдиқ нашуд" },
    WAITLIST_SLOT_FREED: { ru: "{text-1}: освободилось время на {date-1} в {time-1}", tg: "{text-1}: вақти озод {date-1} {time-1} пайдо шуд" },
  };

  function rendered(kind: (typeof KINDS)[number], locale: string, businessName: string): string {
    const { variables } = buildPayomVariables(kind, locale, { businessName, startsAt });
    return Object.entries(variables).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), APPROVED[kind][locale]);
  }

  it("keeps every kind in both languages inside one segment, however long the salon calls itself", () => {
    const long = "Салон красоты «Восточная сказка» на проспекте Рудаки";

    for (const kind of KINDS) {
      for (const locale of ["ru", "tg"]) {
        expect(rendered(kind, locale, long).length, `${kind}/${locale}`).toBeLessThanOrEqual(70);
      }
    }
  });

  it("leaves a name that already fits exactly as the salon wrote it", () => {
    // The real message from the pilot: 43 characters, billed by payom as one.
    expect(rendered("BOOKING_REMINDER", "ru", "Барбершоп Алиф")).toBe("Барбершоп Алиф: ждём вас 2026-08-05 в 14:30");
  });

  it("spends the budget the template actually leaves rather than one number for all of them", () => {
    const long = "Салон красоты «Восточная сказка» на проспекте Рудаки";

    // A reminder is short wording and leaves room; a confirmation in Tajik is the tightest of them all.
    const reminder = buildPayomVariables("BOOKING_REMINDER", "ru", { businessName: long, startsAt }).variables["text-1"];
    const confirmation = buildPayomVariables("BOOKING_CONFIRMATION", "tg", { businessName: long, startsAt }).variables["text-1"];

    expect(reminder.length).toBeGreaterThan(confirmation.length);
    expect(reminder.endsWith("…")).toBe(true);
    expect(confirmation.endsWith("…")).toBe(true);
  });
});
