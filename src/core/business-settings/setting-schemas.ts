import { z } from "zod";

import { MAX_BUFFER_MINUTES } from "@/core/availability/booking-window";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";

const idSchema = z.string().trim().min(1).max(128);
const nameSchema = z.string().trim().min(2).max(120);
const optionalText = (maximum: number) => z.preprocess(
  value => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(maximum).optional(),
);
const uniqueIds = z.array(idSchema).transform(values => [...new Set(values)]);
const phoneSchema = z.preprocess(
  value => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().transform((value, context) => {
    const normalized = normalizeTajikPhone(value);
    if (!normalized) {
      context.addIssue({ code: "custom", message: "INVALID_PHONE" });
      return z.NEVER;
    }
    return normalized;
  }).optional(),
);

export const brandColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "INVALID_COLOR");

export const whatsappSettingsSchema = z.object({
  phoneNumberId: optionalText(64),
  templateName: optionalText(512),
  confirmationTemplateName: optionalText(512),
  cancellationTemplateName: optionalText(512),
  languageCode: z.enum(["ru", "tg"]).default("ru"),
}).strict();

export const notificationSettingsSchema = z.object({
  notifyOnNewBooking: z.boolean(),
  notifyOnPaymentNeedsReview: z.boolean(),
  notifyOnCancellation: z.boolean(),
  smsNotificationsEnabled: z.boolean().default(false),
}).strict();

/**
 * How much of the price must arrive before a slot is held. Shared by the business-wide setting and the
 * per-service override so a service cannot express a rule the business could not, and money is entered in
 * somoni everywhere a person types it — diram exists for arithmetic, not for forms.
 */
const prepaymentFields = {
  // No default: an absent field means the caller is not touching the money rule, and guessing one
  // here used to impose the harshest setting on a salon that never asked for it.
  prepaymentMode: z.enum(["FULL", "DEPOSIT", "NONE"]).optional(),
  depositPercent: z.preprocess(
    value => value === "" || value === null ? undefined : value,
    z.coerce.number().int().min(1).max(100).optional(),
  ),
  depositSomoni: z.preprocess(
    value => typeof value === "string" && value.trim() === "" || value === null ? undefined : value,
    z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,2})?$/).optional(),
  ),
};

/**
 * The booking rules a business enforces rather than describes. Every ceiling here is a deliberate
 * guard rail: a 30-day minimum notice or a two-day booking horizon is far more likely to be a typo in
 * the wrong unit than a real intention, and both would silently empty the public calendar.
 *
 * `null` means "no rule" for the horizon and the reschedule limit, and zero means it for notice and the
 * change window — which is exactly how businesses behaved before these fields existed.
 */
export const bookingPolicySchema = z.object({
  minLeadTimeMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  maxAdvanceDays: z.preprocess(
    value => value === "" || value === null ? undefined : value,
    z.coerce.number().int().min(1).max(365).optional(),
  ),
  freeCancellationHours: z.coerce.number().int().min(0).max(14 * 24),
  maxCustomerReschedules: z.preprocess(
    value => value === "" || value === null ? undefined : value,
    z.coerce.number().int().min(0).max(20).optional(),
  ),
  cancellationPolicy: optionalText(500),
  ...prepaymentFields,
}).strict().superRefine((value, context) => {
  if (value.prepaymentMode === "DEPOSIT" && value.depositPercent === undefined && value.depositSomoni === undefined) {
    // Saving "deposit" without saying how much would charge the whole price, which is the opposite of
    // what the business just asked for. Better to refuse the form than to surprise its customers.
    context.addIssue({ code: "custom", path: ["depositPercent"], message: "DEPOSIT_AMOUNT_REQUIRED" });
  }
});

export const promoCodeInputSchema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, "INVALID_CODE_FORMAT"),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.coerce.number().int().positive(),
  maxRedemptions: z.coerce.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
}).strict().superRefine((value, context) => {
  if (value.discountType === "PERCENT" && value.discountValue > 100) {
    context.addIssue({ code: "custom", path: ["discountValue"], message: "PERCENT_MAX_100" });
  }
});

export const commissionPercentSchema = z.coerce.number().int().min(0).max(100).nullish();

export const branchInputSchema = z.object({
  name: nameSchema,
  address: optionalText(240),
  phone: phoneSchema,
  timeZone: z.string().trim().min(1).refine(isTimeZone, "INVALID_TIME_ZONE"),
  /// Blank leaves the stored card alone — the form cannot show the existing number to prefill it, so an
  /// empty field means "unchanged" rather than "remove". Sixteen digits, spaces optional.
  recipientCard: z.string().transform(value => value.replace(/\s/g, "")).pipe(z.string().regex(/^\d{16}$/)).optional(),
}).strict();

export const serviceInputSchema = z.object({
  branchId: idSchema,
  name: nameSchema,
  description: optionalText(1_000),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  // Capped at MAX_BUFFER_MINUTES: the occupancy query widens its range by exactly that much, so a
  // larger buffer would be silently ignored by conflict detection.
  bufferBeforeMinutes: z.coerce.number().int().min(0).max(MAX_BUFFER_MINUTES).default(0),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(MAX_BUFFER_MINUTES).default(0),
  amountSomoni: z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,2})?$/),
  // Optional here, unlike on the business: an empty mode means "follow the business", which is what
  // every service should say until somebody deliberately decides this one is different.
  prepaymentMode: z.preprocess(
    value => value === "" || value === null ? undefined : value,
    z.enum(["FULL", "DEPOSIT", "NONE"]).optional(),
  ),
  depositPercent: prepaymentFields.depositPercent,
  depositSomoni: prepaymentFields.depositSomoni,
  staffIds: uniqueIds,
  resourceIds: uniqueIds,
  isPublished: z.boolean(),
}).strict();

export const staffInputSchema = z.object({
  displayName: nameSchema,
  phone: phoneSchema,
  branchIds: uniqueIds.refine(values => values.length > 0, "BRANCH_REQUIRED"),
  primaryBranchId: idSchema,
  serviceIds: uniqueIds,
}).strict().superRefine((value, context) => {
  if (!value.branchIds.includes(value.primaryBranchId)) {
    context.addIssue({ code: "custom", path: ["primaryBranchId"], message: "PRIMARY_BRANCH_REQUIRED" });
  }
});

export const resourceInputSchema = z.object({
  branchId: idSchema,
  name: nameSchema,
  kind: z.enum(["WORKSTATION", "ROOM", "LIFT", "EQUIPMENT", "OTHER"]),
  capacity: z.coerce.number().int().min(1).max(100),
  isAvailable: z.boolean(),
  serviceIds: uniqueIds,
}).strict();

const intervalSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict().refine(value => value.startsAt < value.endsAt, { message: "INVALID_INTERVAL", path: ["endsAt"] });

export const weeklyScheduleSchema = z.object({
  rules: z.array(intervalSchema),
  breaks: z.array(intervalSchema),
}).strict().superRefine((value, context) => {
  if (hasOverlaps(value.rules)) {
    context.addIssue({ code: "custom", path: ["rules"], message: "OVERLAPPING_RULES" });
  }
  if (hasOverlaps(value.breaks)) {
    context.addIssue({ code: "custom", path: ["breaks"], message: "OVERLAPPING_BREAKS" });
  }
  for (const item of value.breaks) {
    const containingRule = value.rules.some(rule =>
      rule.dayOfWeek === item.dayOfWeek && rule.startsAt <= item.startsAt && rule.endsAt >= item.endsAt,
    );
    if (!containingRule) context.addIssue({ code: "custom", path: ["breaks"], message: "BREAK_OUTSIDE_HOURS" });
  }
});

function hasOverlaps(values: z.infer<typeof intervalSchema>[]): boolean {
  return values.some((current, index) => values.slice(index + 1).some(next =>
    current.dayOfWeek === next.dayOfWeek && current.startsAt < next.endsAt && next.startsAt < current.endsAt,
  ));
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
