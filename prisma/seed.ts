import { prisma } from "@/core/database/prisma";

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo-barber.local" },
    create: {
      email: "owner@demo-barber.local",
      displayName: "Demo Owner",
    },
    update: {
      displayName: "Demo Owner",
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: "demo-barber" },
    create: {
      name: "Demo Barber",
      slug: "demo-barber",
    },
    update: {
      name: "Demo Barber",
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

  await prisma.branch.upsert({
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
    },
    update: {
      name: "Душанбе, центр",
    },
  });
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
