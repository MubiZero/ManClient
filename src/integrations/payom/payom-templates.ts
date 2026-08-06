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

/** Placeholder names are fixed by payom; `text-1` is free text, `date-1` and `time-1` are validated by format. */
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
 * The approved wording must carry the code in `text-1`, e.g. "ManClient: код подтверждения {text-1}".
 * Payom's `date-1`/`time-1` validators make any other placeholder useless for a numeric code.
 */
export function findPhoneVerificationTemplateId(): string | null {
  const id = process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID?.trim();
  return id ? id : null;
}

export function buildPhoneVerificationSms(code: string): { templateId: string; variables: Record<string, string> } {
  const templateId = findPhoneVerificationTemplateId();
  if (!templateId) throw new Error("PAYOM_PHONE_VERIFICATION_TEMPLATE_ID is not configured");
  return { templateId, variables: { "text-1": code } };
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
  const values: Record<TemplateVariable, string> = {
    "text-1": input.businessName,
    "date-1": new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(input.startsAt),
    "time-1": new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(input.startsAt),
  };

  // Sending a placeholder the template does not contain would be silently dropped, and omitting one
  // it does contain ships raw "{date-1}" to the customer — so the table drives this exactly.
  return {
    templateId: template.id,
    variables: Object.fromEntries(template.variables.map((name) => [name, values[name]])),
  };
}
