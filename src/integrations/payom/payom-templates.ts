/**
 * Payom rejects free text outright: every SMS must name a template that a human moderator has
 * approved, and moderation takes hours. So the wording of an SMS is not ours to change at runtime —
 * all we supply are the variable values. These IDs belong to the one platform-wide payom account,
 * they are not secrets and they are useless without the API token, so they live here in code rather
 * than in environment variables.
 *
 * A template cannot be edited after creation. Fixing wording means creating a new template, waiting
 * for moderation and swapping the ID below.
 */

import { DEFAULT_TIME_ZONE } from "@/core/formatting/dushanbe-date";

export type PayomTemplateKind = "BOOKING_CONFIRMATION" | "BOOKING_REMINDER" | "BOOKING_CANCELLED" | "PAYMENT_REJECTED" | "WAITLIST_SLOT_FREED";

/**
 * Placeholder names are fixed by payom and typed: `text-1` is free text, `date-1` and `time-1` are
 * validated by format. `code-1` exists too, for one-time codes, but no template in this table uses it —
 * it belongs to the verification SMS below, which shares none of these variables.
 */
type TemplateVariable = "text-1" | "date-1" | "time-1";

type PayomTemplate = {
  id: string;
  /** Only the placeholders this template actually contains — payom substitutes nothing else. */
  variables: readonly TemplateVariable[];
  /** The approved wording, for reference when reading this table. Never sent. */
  approvedText: string;
};

const TEMPLATES: Record<PayomTemplateKind, Record<"ru" | "tg", PayomTemplate>> = {
  BOOKING_CONFIRMATION: {
    ru: {
      id: "3e93c31b-8969-4094-9200-9318de306f08",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: запись на {date-1}, {time-1} подтверждена",
    },
    tg: {
      // Contains a stray Russian "в" that moderation let through. Templates are immutable, so this
      // stands until a corrected one is approved and swapped in here.
      id: "04e74aa4-c9a3-49e8-a55a-788cc13b375a",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: сабт санаи {date-1} в соати {time-1} тасдиқ шуд",
    },
  },
  BOOKING_REMINDER: {
    ru: {
      id: "0dee934e-86e4-41a1-9471-9b1da8566d12",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: ждём вас {date-1} в {time-1}",
    },
    tg: {
      id: "68f754ae-1006-4121-bfc2-188b8ebc1bdf",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: сабти шумо {date-1} соати {time-1}",
    },
  },
  BOOKING_CANCELLED: {
    ru: {
      id: "a6f32d74-e363-4843-933d-36f96e2bd6fa",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: запись на {date-1} в {time-1} отменена",
    },
    tg: {
      id: "e2f98e81-c89b-477f-95d5-1b9aa8a028e5",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: сабт барои {date-1} {time-1} бекор шуд",
    },
  },
  PAYMENT_REJECTED: {
    ru: {
      id: "4b336b24-80d2-46e8-9b74-0b2b8af86259",
      variables: ["text-1", "date-1"],
      approvedText: "{text-1}: чек по записи {date-1} не принят",
    },
    tg: {
      id: "16f2be06-d16d-4ead-a0a5-830ca29abf35",
      variables: ["text-1", "date-1"],
      approvedText: "{text-1}: расиди сабти {date-1} тасдиқ нашуд",
    },
  },
  WAITLIST_SLOT_FREED: {
    ru: {
      id: "bdb4b7f4-3a79-4f79-9e7c-453c2d02da74",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: освободилось время на {date-1} в {time-1}",
    },
    tg: {
      id: "d5b45e80-bb2f-4e36-9dd0-697376b9adce",
      variables: ["text-1", "date-1", "time-1"],
      approvedText: "{text-1}: вақти озод {date-1} {time-1} пайдо шуд",
    },
  },
};

/**
 * The verification code template is the one entry whose ID is not hardcoded above. Every other
 * template was approved before this table was written; this one is created per payom account and its
 * moderation is the gate on turning phone verification on at all — so it is read from
 * `PAYOM_PHONE_VERIFICATION_TEMPLATE_ID` and its absence is what keeps the feature switched off.
 *
 * The approved wording is "{text-1} - код подтверждения: {code-1}" — who is asking, then the code. The
 * code sits in `code-1` because payom types that placeholder for one-time codes and moderation rejects a
 * code put in a free-text slot. The name stays free text: it is what tells a customer why an SMS arrived,
 * so it carries the business for a booking and the platform for account recovery, where no single
 * business is the one asking.
 */
export function findPhoneVerificationTemplateId(): string | null {
  const id = process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID?.trim();
  return id ? id : null;
}

/** Used when nobody in particular is asking — account recovery belongs to the platform, not a salon. */
export const PLATFORM_SMS_LABEL = "ManClient";

/**
 * A Cyrillic SMS is sent as UCS-2, which fits 70 characters in one segment. Payom counts segments and
 * calls them "сообщений": a delivered text of 43 characters shows as `1 шт.` against −0,045 сомони, so
 * a message that spills past 70 is billed as two.
 *
 * Everything below exists to make sure that never happens. Then the ledger's row count equals the number
 * of segments by construction, and what a salon costs is a number rather than an estimate.
 */
const SMS_SEGMENT_LENGTH = 70;

/**
 * " - код подтверждения: " plus six digits spends 28 of the 70, leaving 42. Forty keeps a margin for a
 * template whose approved wording differs slightly from the one in the runbook — the id comes from the
 * environment, and its exact text is not ours to read.
 */
const MAX_LABEL_LENGTH = 40;

export function smsLabel(name: string | null | undefined, budget = MAX_LABEL_LENGTH): string {
  const trimmed = name?.trim();
  if (!trimmed) return PLATFORM_SMS_LABEL;
  // A truncated salon name still tells the customer who is writing; a doubled bill tells them nothing.
  return trimmed.length <= budget ? trimmed : `${trimmed.slice(0, budget - 1).trimEnd()}…`;
}

export function buildPhoneVerificationSms(code: string, label: string): { templateId: string; variables: Record<string, string> } {
  const templateId = findPhoneVerificationTemplateId();
  if (!templateId) throw new Error("PAYOM_PHONE_VERIFICATION_TEMPLATE_ID is not configured");
  return { templateId, variables: { "text-1": smsLabel(label), "code-1": code } };
}

/**
 * Not every notification we send has an SMS template. Review requests can never have one — payom
 * forbids links in template text — and payment reminders and receipt-received notices simply have
 * none yet. Callers must treat `null` as "this kind does not go out over SMS" rather than an error.
 */
export function findPayomTemplateKind(messageKind: string): PayomTemplateKind | null {
  if (messageKind === "BOOKING_CONFIRMATION" || messageKind === "PAYMENT_APPROVED") return "BOOKING_CONFIRMATION";
  if (messageKind === "BOOKING_REMINDER") return "BOOKING_REMINDER";
  if (messageKind === "BOOKING_CANCELLED") return "BOOKING_CANCELLED";
  if (messageKind === "PAYMENT_REJECTED") return "PAYMENT_REJECTED";
  if (messageKind === "WAITLIST_SLOT_FREED") return "WAITLIST_SLOT_FREED";
  return null;
}

/**
 * Payom validates `date-1` against `Y-m-d` and rejects anything else, so a customer-friendly
 * "5 августа" is not available to us — the date always reads as 2026-08-05 in the delivered SMS.
 *
 * `timeZone` comes from the branch the visit belongs to. It defaults to Dushanbe because that is where
 * every pilot branch is, but it is a parameter rather than a constant: the first branch outside UTC+5
 * would otherwise send every customer a time that is silently wrong by hours.
 */
export function buildPayomVariables(
  kind: PayomTemplateKind,
  locale: string,
  input: { businessName: string; startsAt: Date; timeZone?: string },
): { templateId: string; variables: Record<string, string> } {
  const template = TEMPLATES[kind][locale === "tg" ? "tg" : "ru"];
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(input.startsAt);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(input.startsAt);
  const values: Record<TemplateVariable, string> = {
    // The name is the only variable-length part, so it is the one that has to give. The budget is read
    // off the approved wording rather than hardcoded: these templates differ by 20 characters between
    // kinds and languages, and a single constant would either truncate needlessly or not enough.
    "text-1": smsLabel(input.businessName, nameBudget(template, date, time)),
    "date-1": date,
    "time-1": time,
  };

  // Sending a placeholder the template does not contain would be silently dropped, and omitting one
  // it does contain ships raw "{date-1}" to the customer — so the table drives this exactly.
  return {
    templateId: template.id,
    variables: Object.fromEntries(template.variables.map((name) => [name, values[name]])),
  };
}

/**
 * How much of one segment is left for the salon's name once the approved wording and the visit's date
 * and time have taken their share. Measured against the text payom will actually deliver, which is why
 * `approvedText` is kept next to every id.
 */
function nameBudget(template: PayomTemplate, date: string, time: string): number {
  const fixedLength = template.approvedText
    .replace("{text-1}", "")
    .replace("{date-1}", date)
    .replace("{time-1}", time).length;
  return Math.max(1, SMS_SEGMENT_LENGTH - fixedLength);
}
