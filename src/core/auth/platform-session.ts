import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requirePlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isPlatformAdmin) redirect("/login");
  return { userId: session.user.id, displayName: session.user.name ?? "Платформа" };
}
