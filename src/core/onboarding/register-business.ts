import { randomBytes } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { hashPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";
import { startTrial } from "@/core/platform/subscription-lifecycle";

const registrationSchema = z.object({
  ownerName: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\+992\d{9}$/),
  password: z.string().min(8).max(128),
  businessName: z.string().trim().min(2).max(120),
}).strict();

export type RegisterBusinessInput = z.input<typeof registrationSchema>;

export class RegistrationError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "PHONE_ALREADY_USED") {
    super(code);
    this.name = "RegistrationError";
  }
}

export async function registerBusiness(input: RegisterBusinessInput) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new RegistrationError("INVALID_INPUT");
  const passwordHash = await hashPassword(parsed.data.password);
  const businessSlug = `${slugBase(parsed.data.businessName)}-${randomBytes(4).toString("hex")}`;

  try {
    return await prisma.$transaction(async transaction => {
      const user = await transaction.user.create({
        data: {
          phone: parsed.data.phone,
          displayName: parsed.data.ownerName,
          passwordHash,
        },
      });
      // The trial is written here rather than as a schema default: the default has to stay `START`
      // and `ACTIVE` so that every business created before billing — and every manual grant since —
      // keeps working with no end date at all.
      const business = await transaction.business.create({
        data: { name: parsed.data.businessName, slug: businessSlug, ...startTrial(new Date()) },
      });
      const membership = await transaction.membership.create({
        data: { userId: user.id, businessId: business.id, role: "OWNER" },
      });
      const branch = await transaction.branch.create({
        data: { businessId: business.id, name: "Основной филиал", slug: "main" },
      });
      await Promise.all([
        transaction.staffMember.create({
          data: {
            businessId: business.id,
            membershipId: membership.id,
            displayName: parsed.data.ownerName,
            branches: { create: { branchId: branch.id, isPrimary: true } },
          },
        }),
        transaction.businessScheduleRule.createMany({
          data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            branchId: branch.id,
            dayOfWeek,
            startsAt: "09:00",
            endsAt: "18:00",
          })),
        }),
      ]);
      return { userId: user.id, businessId: business.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RegistrationError("PHONE_ALREADY_USED");
    }
    throw error;
  }
}

function slugBase(value: string) {
  const slug = value.toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "business";
}
