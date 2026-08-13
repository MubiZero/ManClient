import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { ACTIVE_BUSINESS_COOKIE, requireBusinessSession } from "@/core/auth/business-session";
import { countPaymentsForReview } from "@/core/payments/payment-review-service";
import { DashboardNav } from "@/features/dashboard/dashboard-nav";
import { GraceBanner } from "@/features/dashboard/subscription/grace-banner";
import { graceDisableAt } from "@/features/dashboard/subscription/subscription-summary";
import { Toaster } from "@/features/ui-kit/toaster";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const membership = await requireBusinessSession();
  // Unpaid is not the same as suspended: the day carries on, and the banner only says what will
  // stop and when. Shown to owners and administrators, since a specialist cannot act on it.
  // Only owners and administrators review receipts, so nobody else is shown a number they cannot act on.
  const pendingReceiptCount = membership.role === "STAFF" ? 0 : await countPaymentsForReview(membership.businessId);
  const disableAt = membership.role === "STAFF" ? null : graceDisableAt({
    status: membership.business.subscriptionStatus,
    endsAt: membership.business.subscriptionEndsAt,
  });

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
        pendingReceiptCount={pendingReceiptCount}
        signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}
        switchBusinessAction={switchBusinessAction}
      />
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
          {disableAt ? <GraceBanner disableAt={disableAt} /> : null}
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
