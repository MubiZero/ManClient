import { z } from "zod";

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

export const branchInputSchema = z.object({
  name: nameSchema,
  address: optionalText(240),
  phone: phoneSchema,
  timeZone: z.string().trim().min(1).refine(isTimeZone, "INVALID_TIME_ZONE"),
}).strict();

export const serviceInputSchema = z.object({
  branchId: idSchema,
  name: nameSchema,
  description: optionalText(1_000),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  amountSomoni: z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,2})?$/),
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
