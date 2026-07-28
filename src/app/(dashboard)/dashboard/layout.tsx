import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { requireBusinessSession } from "@/core/auth/business-session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const membership = await requireBusinessSession();

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand"><span>MC</span><div><strong>ManClient</strong><small>{membership.business.name}</small></div></div>
        <nav aria-label="Кабинет">
          <Link href="/dashboard">Обзор</Link>
          <Link href="/dashboard/bookings">Записи</Link>
          {membership.role !== "STAFF" && <>
            <p>Настройки</p>
            <Link href="/dashboard/settings/branches">Филиалы</Link>
            <Link href="/dashboard/settings/services">Услуги</Link>
            <Link href="/dashboard/settings/staff">Сотрудники</Link>
            <Link href="/dashboard/settings/resources">Ресурсы</Link>
          </>}
        </nav>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button className="signout-button" type="submit">Выйти</button>
        </form>
      </aside>
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
