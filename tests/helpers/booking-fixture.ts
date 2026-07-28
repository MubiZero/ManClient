import { randomUUID } from "node:crypto";

import { prisma } from "@/core/database/prisma";

export async function createBookingFixture() {
  const suffix = randomUUID();
  const business = await prisma.business.create({
    data: { name: "Pilot Barber", slug: `pilot-barber-${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: "Dushanbe",
      slug: "dushanbe",
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
    data: { branchId: branch.id, membershipId: membership.id, displayName: "Alisher" },
  });
  const service = await prisma.service.create({
    data: {
      branchId: branch.id,
      name: "Haircut",
      durationMinutes: 45,
      amountDiram: 5_000,
      staffMembers: { connect: { id: staff.id } },
    },
  });

  return { branch, business, service, staff };
}
