import "@/core/config/load-env-file";

import { prisma } from "@/core/database/prisma";

async function main() {
  const identifier = process.argv[2];
  if (!identifier) throw new Error("Usage: pnpm platform:grant-admin -- <email-or-phone>");

  const normalized = identifier.includes("@") ? identifier.trim().toLowerCase() : identifier.trim();
  const user = await prisma.user.update({
    where: normalized.includes("@") ? { email: normalized } : { phone: normalized },
    data: { isPlatformAdmin: true },
    select: { id: true, displayName: true, email: true, phone: true },
  });
  process.stdout.write(`Granted platform admin to ${user.displayName} (${user.email ?? user.phone}).\n`);
}

void main().finally(() => prisma.$disconnect());
