import { cookies } from "next/headers";
import Link from "next/link";

import { createCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { readCustomerPhone } from "@/core/customers/customer-session";
import { listVisitsForPhone, type CustomerVisit } from "@/core/customers/customer-visits";
import { CustomerLoginForm } from "@/features/customer-visits/customer-login-form";
import { SignOutButton } from "@/features/customer-visits/sign-out-button";
import { VisitList, type VisitView } from "@/features/customer-visits/visit-list";
import { LogoMark } from "@/features/ui-kit/logo-mark";
import { resolveLocale, t } from "@/i18n/translate";

const LOCALE_COOKIE = "nc-locale";

/**
 * The customer's half of the product.
 *
 * Until now a booking existed only in whatever channel confirmed it — an SMS scrolled past, a Telegram
 * thread, a receipt photo. A customer who wanted to know when they were due had to ring the salon, and
 * a customer who wanted to move a visit had to find a message from three weeks ago. This page is the
 * place their bookings live, and it is the same place a mobile app will later ask for.
 */
export default async function MyVisitsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const cookieStore = await cookies();
  const locale = resolveLocale([lang, cookieStore.get(LOCALE_COOKIE)?.value]);
  const phone = await readCustomerPhone();
  const visits = phone ? await listVisitsForPhone(phone) : null;

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <LogoMark className="size-6 text-primary" />
            <span className="text-sm font-semibold">ManClient</span>
          </Link>
          <span className="text-sm font-medium text-muted-foreground">{t(locale, "visits.title")}</span>
          <nav className="ml-auto flex items-center gap-3 text-xs font-medium" aria-label={t(locale, "booking.languageSwitcherLabel")}>
            <span className="flex items-center gap-1">
              <a
                href="?lang=ru"
                aria-current={locale === "ru" ? "true" : undefined}
                className={locale === "ru" ? "text-foreground underline underline-offset-2" : "text-muted-foreground hover:text-foreground"}
              >
                RU
              </a>
              <span className="text-muted-foreground" aria-hidden>
                /
              </span>
              <a
                href="?lang=tg"
                aria-current={locale === "tg" ? "true" : undefined}
                className={locale === "tg" ? "text-foreground underline underline-offset-2" : "text-muted-foreground hover:text-foreground"}
              >
                TG
              </a>
            </span>
            {phone ? <SignOutButton locale={locale} /> : null}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 pb-4 pt-8">
        <h1 className="text-2xl font-bold text-foreground">{t(locale, "visits.title")}</h1>
        <p className="mt-2 text-muted-foreground">{phone ? t(locale, "visits.subtitle", { phone }) : t(locale, "visits.signedOutSubtitle")}</p>
      </section>

      <div className="mx-auto max-w-2xl px-4 pb-16">
        {visits ? (
          <VisitList locale={locale} upcoming={visits.upcoming.map(toView)} past={visits.past.map(toView)} />
        ) : (
          <CustomerLoginForm locale={locale} />
        )}
      </div>
    </main>
  );
}

function toView(visit: CustomerVisit): VisitView {
  return {
    id: visit.id,
    businessName: visit.businessName,
    businessSlug: visit.businessSlug,
    branchName: visit.branchName,
    timeZone: visit.timeZone,
    serviceName: visit.serviceName,
    staffName: visit.staffName,
    startsAt: visit.startsAt.toISOString(),
    status: visit.status,
    canCancel: visit.canCancel,
    canReschedule: visit.canReschedule,
    rescheduleHref: visit.canReschedule ? rescheduleHref(visit) : null,
  };
}

/**
 * The move flow is reached through the same signed link the Telegram bot hands out, so there is one
 * reschedule page rather than two. The token dies when the visit starts: it is a link to a specific
 * appointment, not a standing key to the account.
 */
function rescheduleHref(visit: CustomerVisit): string | null {
  if (!process.env.BOOKING_ACTION_SECRET) return null;
  return `/reschedule/${createCustomerBookingToken({ bookingId: visit.id, action: "reschedule_booking", expiresAt: visit.startsAt })}`;
}
