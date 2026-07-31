import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/core/database/prisma";

export const ACTIVE_BUSINESS_COOKIE = "manclient-active-business";

export async function requireBusinessSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { business: true, staff: true, user: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/login");

  const activeBusinessId = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
  const active = memberships.find((item) => item.businessId === activeBusinessId) ?? memberships[0];

  return {
    ...active,
    availableBusinesses:
      memberships.length > 1 ? memberships.map((item) => ({ businessId: item.businessId, businessName: item.business.name })) : [],
  };
}

export async function requireBusinessAdmin() {
  const membership = await requireBusinessSession();
  if (membership.role === "STAFF") redirect("/dashboard?notice=settings");
  return membership;
}
