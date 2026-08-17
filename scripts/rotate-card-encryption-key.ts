import "@/core/config/load-env-file";

import { prisma } from "@/core/database/prisma";
import { decryptCardNumber, encryptCardNumber } from "@/core/payments/card-encryption";

async function main() {
  const oldKey = requiredEnv("OLD_CARD_ENCRYPTION_KEY");
  const newKey = requiredEnv("NEW_CARD_ENCRYPTION_KEY");
  const branches = await prisma.branch.findMany({
    where: { recipientCardEncrypted: { not: null } },
    select: { id: true, recipientCardEncrypted: true },
  });

  await prisma.$transaction(branches.map(branch => {
    const cardNumber = decryptCardNumber(branch.recipientCardEncrypted!, oldKey);
    return prisma.branch.update({
      where: { id: branch.id },
      data: { recipientCardEncrypted: encryptCardNumber(cardNumber, newKey) },
    });
  }));
  process.stdout.write(`Rotated encrypted payment cards for ${branches.length} branches.\n`);
}

function requiredEnv(name: "OLD_CARD_ENCRYPTION_KEY" | "NEW_CARD_ENCRYPTION_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main().finally(() => prisma.$disconnect());
