import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { ACTIVE_BUSINESS_COOKIE, requireBusinessSession } from "@/core/auth/business-session";
import { DashboardNav } from "@/features/dashboard/dashboard-nav";
import { Toaster } from "@/features/ui-kit/toaster";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const membership = await requireBusinessSession();

  async function switchBusinessAction(formData: FormData) {
    "use server";
    const businessId = formData.get("businessId");
    if (typeof businessId === "string" && businessId) {
      (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { httpOnly: true, sameSite: "lax", path: "/" });
    }
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
      <DashboardNav
        role={membership.role}
        businessName={membership.business.name}
        displayName={membership.user.displayName}
        roleLabel={roleLabel(membership.role)}
        availableBusinesses={membership.availableBusinesses}
        signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}
        switchBusinessAction={switchBusinessAction}
      />
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
          {membership.business.status === "SUSPENDED" ? (
            <div
              className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-700 dark:bg-danger-600/10 dark:text-danger-500"
              role="alert"
            >
              Бизнес приостановлен платформой ManClient. Новые записи и онлайн-оплата недоступны клиентам. Свяжитесь с поддержкой ManClient, чтобы возобновить работу.
            </div>
          ) : null}
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function roleLabel(role: "OWNER" | "ADMIN" | "STAFF") {
  return role === "OWNER" ? "Владелец" : role === "ADMIN" ? "Администратор" : "Сотрудник";
}
