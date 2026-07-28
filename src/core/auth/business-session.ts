import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/core/database/prisma";

export async function requireBusinessSession() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { user: { email: session.user.email } },
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
