import { verifyPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/features/onboarding/tajik-phone";

export async function authenticateCredentials(identifier: string, password: string) {
  const normalized = identifier.trim();
  const phone = normalizeTajikPhone(normalized);
  const user = phone
    ? await prisma.user.findUnique({ where: { phone } })
    : await prisma.user.findUnique({ where: { email: normalized.toLowerCase() } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email ?? undefined, name: user.displayName };
}
