import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/core/database/prisma";

export async function requireBusinessSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { business: true, staff: true, user: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/login");

  return membership;
}

export async function requireBusinessAdmin() {
  const membership = await requireBusinessSession();
  if (membership.role === "STAFF") redirect("/dashboard?notice=settings");
  return membership;
}
