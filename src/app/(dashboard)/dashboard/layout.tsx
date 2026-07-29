import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { requireBusinessSession } from "@/core/auth/business-session";
import { DashboardNav } from "@/features/dashboard/dashboard-nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const membership = await requireBusinessSession();

  return (
    <div className="dashboard-shell">
      <DashboardNav role={membership.role} businessName={membership.business.name} displayName={membership.user.displayName} roleLabel={roleLabel(membership.role)} signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} />
      <main className="dashboard-main">
        <header className="dashboard-topbar"><div><strong>{membership.user.displayName}</strong><small>{roleLabel(membership.role)}</small></div></header>
        {children}
      </main>
    </div>
  );
}

function roleLabel(role: "OWNER" | "ADMIN" | "STAFF") {
  return role === "OWNER" ? "Владелец" : role === "ADMIN" ? "Администратор" : "Сотрудник";
}
