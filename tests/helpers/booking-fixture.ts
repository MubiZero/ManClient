import { randomUUID } from "node:crypto";

import { prisma } from "@/core/database/prisma";
import { encryptCardNumber } from "@/core/payments/card-encryption";

const fixtureEncryptionKey = Buffer.alloc(32, 7).toString("base64");

export async function createBookingFixture() {
  process.env.CARD_ENCRYPTION_KEY ??= fixtureEncryptionKey;
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: "Pilot Barber", slug: `pilot-barber-${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: "Dushanbe",
      slug: "dushanbe",
      recipientCardEncrypted: encryptCardNumber("1111222233334444", process.env.CARD_ENCRYPTION_KEY),
      recipientCardLast4: "4444",
      scheduleRules: { create: { dayOfWeek: 0, startsAt: "09:00", endsAt: "18:00" } },
    },
  });
  const user = await prisma.user.create({
    data: { email: `staff-${suffix}@example.test`, displayName: "Alisher" },
  });
  const membership = await prisma.membership.create({
    data: { businessId: business.id, userId: user.id, role: "STAFF" },
  });
  const staff = await prisma.staffMember.create({
    data: { businessId: business.id, membershipId: membership.id, displayName: "Alisher", branches: { create: { branchId: branch.id, isPrimary: true } } },
  });
  const service = await prisma.service.create({
    data: {
      branchId: branch.id,
      name: "Haircut",
      durationMinutes: 45,
      amountDiram: 5_000,
      isPublished: true,
      staffMembers: { connect: { id: staff.id } },
    },
  });

  return { branch, business, service, staff };
}
