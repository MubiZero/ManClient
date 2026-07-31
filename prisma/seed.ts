import { prisma } from "@/core/database/prisma";
import { encryptCardNumber } from "@/core/payments/card-encryption";
import { hashPassword } from "@/core/auth/password";

async function main() {
  await resetDatabase();
  const paymentCardEncrypted = paymentCard();
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo-barber.local" },
    create: {
      email: "owner@demo-barber.local",
      displayName: "Фарид Саидов",
      passwordHash: await configuredPasswordHash("DEMO_OWNER_PASSWORD"),
    },
    update: {
      displayName: "Фарид Саидов",
      passwordHash: await configuredPasswordHash("DEMO_OWNER_PASSWORD"),
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: "demo-barber" },
    create: {
      name: "Сартарош",
      slug: "demo-barber",
    },
    update: {
      name: "Сартарош",
    },
  });

  await prisma.membership.upsert({
    where: {
      businessId_userId: {
        businessId: business.id,
        userId: owner.id,
      },
    },
    create: {
      businessId: business.id,
      userId: owner.id,
      role: "OWNER",
    },
    update: {
      role: "OWNER",
    },
  });

  const branch = await prisma.branch.upsert({
    where: {
      businessId_slug: {
        businessId: business.id,
        slug: "dushanbe-center",
      },
    },
    create: {
      businessId: business.id,
      name: "Душанбе, центр",
      slug: "dushanbe-center",
      ...(paymentCardEncrypted
        ? { recipientCardEncrypted: paymentCardEncrypted, recipientCardLast4: "4444" }
        : {}),
    },
    update: {
      name: "Душанбе, центр",
      ...(paymentCardEncrypted
        ? { recipientCardEncrypted: paymentCardEncrypted, recipientCardLast4: "4444" }
        : {}),
    },
  });

  await prisma.businessScheduleRule.deleteMany({ where: { branchId: branch.id } });
  await prisma.businessScheduleRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      branchId: branch.id,
      dayOfWeek,
      startsAt: "09:00",
      endsAt: "18:00",
    })),
  });

  const staffUser = await prisma.user.upsert({
    where: { email: "alisher@demo-barber.local" },
    create: { email: "alisher@demo-barber.local", displayName: "Алишер Рахмонов", passwordHash: await configuredPasswordHash("DEMO_STAFF_PASSWORD") },
    update: { displayName: "Алишер Рахмонов", passwordHash: await configuredPasswordHash("DEMO_STAFF_PASSWORD") },
  });
  const staffMembership = await prisma.membership.upsert({
    where: { businessId_userId: { businessId: business.id, userId: staffUser.id } },
    create: { businessId: business.id, userId: staffUser.id, role: "STAFF" },
    update: { role: "STAFF" },
  });
  const staff = await prisma.staffMember.upsert({
    where: { membershipId: staffMembership.id },
    create: {
      businessId: business.id,
      membershipId: staffMembership.id,
      displayName: "Алишер",
    },
    update: { businessId: business.id, displayName: "Алишер" },
  });
  await prisma.staffBranch.upsert({
    where: { staffId_branchId: { staffId: staff.id, branchId: branch.id } },
    create: { staffId: staff.id, branchId: branch.id, isPrimary: true },
    update: { isPrimary: true },
  });

  const existingService = await prisma.service.findFirst({
    where: { branchId: branch.id, name: "Мужская стрижка" },
  });
  if (existingService) {
    await prisma.service.update({
      where: { id: existingService.id },
      data: {
        durationMinutes: 45,
        amountDiram: 5_000,
        isPublished: true,
        staffMembers: { set: [{ id: staff.id }] },
      },
    });
  } else {
    await prisma.service.create({
      data: {
        branchId: branch.id,
        name: "Мужская стрижка",
        durationMinutes: 45,
        amountDiram: 5_000,
        isPublished: true,
        staffMembers: { connect: { id: staff.id } },
      },
    });
  }

  await seedAutoService(paymentCardEncrypted);
}

async function seedAutoService(paymentCardEncrypted: string | undefined) {
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo-auto.local" },
    create: { email: "owner@demo-auto.local", displayName: "Рустам Каримов", passwordHash: await configuredPasswordHash("DEMO_AUTO_OWNER_PASSWORD") },
    update: { displayName: "Рустам Каримов", passwordHash: await configuredPasswordHash("DEMO_AUTO_OWNER_PASSWORD") },
  });
  const business = await prisma.business.upsert({
    where: { slug: "demo-auto" },
    create: { name: "АвтоПрофи", slug: "demo-auto" },
    update: { name: "АвтоПрофи" },
  });
  await prisma.membership.upsert({
    where: { businessId_userId: { businessId: business.id, userId: owner.id } },
    create: { businessId: business.id, userId: owner.id, role: "OWNER" },
    update: { role: "OWNER" },
  });
  const branch = await prisma.branch.upsert({
    where: { businessId_slug: { businessId: business.id, slug: "dushanbe-auto" } },
    create: {
      businessId: business.id,
      name: "Душанбе, Сино",
      slug: "dushanbe-auto",
      ...(paymentCardEncrypted ? { recipientCardEncrypted: paymentCardEncrypted, recipientCardLast4: "4444" } : {}),
    },
    update: {
      name: "Душанбе, Сино",
      ...(paymentCardEncrypted ? { recipientCardEncrypted: paymentCardEncrypted, recipientCardLast4: "4444" } : {}),
    },
  });
  await prisma.businessScheduleRule.deleteMany({ where: { branchId: branch.id } });
  await prisma.businessScheduleRule.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ branchId: branch.id, dayOfWeek, startsAt: "09:00", endsAt: "18:00" })) });

  const staffUser = await prisma.user.upsert({
    where: { email: "behruz@demo-auto.local" },
    create: { email: "behruz@demo-auto.local", displayName: "Бехруз Ниёзов" },
    update: { displayName: "Бехруз Ниёзов" },
  });
  const membership = await prisma.membership.upsert({
    where: { businessId_userId: { businessId: business.id, userId: staffUser.id } },
    create: { businessId: business.id, userId: staffUser.id, role: "STAFF" },
    update: { role: "STAFF" },
  });
  const staff = await prisma.staffMember.upsert({
    where: { membershipId: membership.id },
    create: { businessId: business.id, membershipId: membership.id, displayName: "Бехруз" },
    update: { businessId: business.id, displayName: "Бехруз" },
  });
  await prisma.staffBranch.upsert({
    where: { staffId_branchId: { staffId: staff.id, branchId: branch.id } },
    create: { staffId: staff.id, branchId: branch.id, isPrimary: true },
    update: { isPrimary: true },
  });
  const resource = await prisma.resource.findFirst({ where: { branchId: branch.id, name: "Подъёмник 1" } })
    ?? await prisma.resource.create({ data: { branchId: branch.id, name: "Подъёмник 1" } });
  const service = await prisma.service.findFirst({ where: { branchId: branch.id, name: "Замена масла" } });
  if (service) {
    await prisma.service.update({
      where: { id: service.id },
      data: {
        durationMinutes: 60,
        amountDiram: 12_000,
        isPublished: true,
        staffMembers: { set: [{ id: staff.id }] },
        resources: { deleteMany: {}, create: { resourceId: resource.id } },
      },
    });
  } else {
    await prisma.service.create({
      data: {
        branchId: branch.id,
        name: "Замена масла",
        durationMinutes: 60,
        amountDiram: 12_000,
        isPublished: true,
        staffMembers: { connect: { id: staff.id } },
        resources: { create: { resourceId: resource.id } },
      },
    });
  }
}

async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const quotedTables = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
}

function paymentCard(): string | undefined {
  return process.env.CARD_ENCRYPTION_KEY
    ? encryptCardNumber("1111222233334444", process.env.CARD_ENCRYPTION_KEY)
    : undefined;
}

async function configuredPasswordHash(variableName: "DEMO_OWNER_PASSWORD" | "DEMO_STAFF_PASSWORD" | "DEMO_AUTO_OWNER_PASSWORD") {
  const password = process.env[variableName];
  return password ? hashPassword(password) : undefined;
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
