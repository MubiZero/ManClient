import { cookies } from "next/headers";
import { brandPalette } from "@/core/branding/brand-palette";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { Star } from "lucide-react";

import { readCustomerPhone } from "@/core/customers/customer-session";
import { findCustomerName } from "@/core/customers/customer-visits";
import { prisma } from "@/core/database/prisma";
import { businessHasFeature } from "@/core/platform/subscription-plans";
import { getAverageRating } from "@/core/reviews/review-service";
import { BookingForm } from "@/features/public-booking/booking-form";
import { PolicyNotice } from "@/features/public-booking/policy-notice";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { resolveLocale, t } from "@/i18n/translate";

const LOCALE_COOKIE = "nc-locale";

type PageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function PublicBookingPage({ params, searchParams }: PageProps) {
  const { businessSlug } = await params;
  const { lang } = await searchParams;
  const cookieStore = await cookies();
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      logoStorageKey: true,
      brandColor: true,
      cancellationPolicy: true,
      minLeadTimeMinutes: true,
      maxAdvanceDays: true,
      freeCancellationHours: true,
      maxCustomerReschedules: true,
      prepaymentMode: true,
      depositPercent: true,
      depositAmountDiram: true,
      publicPageLocale: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      // The same conditions availability and booking enforce, applied to what the customer is offered
      // in the first place. A service is a draft until it is published — `isPublished` starts false —
      // and an archived one is history, so both used to appear in the picker and then refuse to yield
      // a single free time, which reads to the customer as a salon with no room left.
      branches: {
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          timeZone: true,
          services: {
            where: { archivedAt: null, isPublished: true },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              durationMinutes: true,
              amountDiram: true,
              staffMembers: { where: { archivedAt: null }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } },
              resources: { select: { resourceId: true } },
            },
          },
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  const locale = resolveLocale([lang, cookieStore.get(LOCALE_COOKIE)?.value, business.publicPageLocale]);

  const brandStyle = business.brandColor
    ? (brandPalette(business.brandColor) as CSSProperties | null) ?? undefined
    : undefined;

  const rating = businessHasFeature(business, "REVIEWS")
    ? await getAverageRating(business.id)
    : { average: null, count: 0 };

  // A customer who has signed in gets their own details back rather than a blank form — and, because
  // the session already proves the number, no second SMS on the way to the same booking.
  const signedInPhone = await readCustomerPhone();
  const signedInCustomer = signedInPhone ? { phone: signedInPhone, name: await findCustomerName(signedInPhone) } : null;

  // A branch with nothing published is not a choice. Offering it puts the customer on a service step
  // with an empty list and no way to tell whether the floor is closed or the page is broken.
  const bookableBranches = business.branches.filter(({ services }) => services.length > 0);

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <PublicBrandMark slug={business.slug} name={business.name} hasLogo={Boolean(business.logoStorageKey)} href={`/b/${business.slug}`} />
          <span className="text-sm font-medium text-muted-foreground">{t(locale, "booking.onlineBookingLabel")}</span>
          <a href="/my" className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground">
            {t(locale, "visits.linkLabel")}
          </a>
          <nav className="flex items-center gap-1 text-xs font-medium" aria-label={t(locale, "booking.languageSwitcherLabel")}>
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
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 pb-4 pt-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-primary">{business.name}</p>
          {rating.average !== null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
              <Star className="size-3.5 fill-current text-amber-500" aria-hidden />
              {rating.average.toFixed(1)} ({formatReviewCount(rating.count)})
            </span>
          ) : null}
        </div>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{t(locale, "booking.heroTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t(locale, "booking.heroSubtitle")}</p>
      </section>
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {business.status === "SUSPENDED" ? (
          <EmptyState
            title={t(locale, "booking.suspendedTitle")}
            description={t(locale, "booking.suspendedDescription")}
          />
        ) : bookableBranches.length === 0 ? (
          <EmptyState
            title={t(locale, "booking.comingSoonTitle")}
            description={t(locale, "booking.comingSoonDescription")}
          />
        ) : (
          <>
            <BookingForm
              businessSlug={business.slug}
              branches={bookableBranches}
              locale={locale}
              canRepeat={businessHasFeature(business, "RECURRING_BOOKINGS")}
              canUsePromoCodes={businessHasFeature(business, "PROMO_CODES")}
              canUseWaitlist={businessHasFeature(business, "WAITLIST")}
              signedInCustomer={signedInCustomer}
            />
            <PolicyNotice
              locale={locale}
              policy={{
                minLeadTimeMinutes: business.minLeadTimeMinutes,
                maxAdvanceDays: business.maxAdvanceDays,
                freeCancellationHours: business.freeCancellationHours,
                maxCustomerReschedules: business.maxCustomerReschedules,
                cancellationPolicy: business.cancellationPolicy,
                prepaymentMode: business.prepaymentMode,
                depositPercent: business.depositPercent,
                depositAmountDiram: business.depositAmountDiram,
              }}
            />
          </>
        )}
      </div>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        {t(locale, "booking.poweredBy")}
      </footer>
    </main>
  );
}

function formatReviewCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? "отзывов" : last === 1 ? "отзыв" : last >= 2 && last <= 4 ? "отзыва" : "отзывов";
  return `${count} ${word}`;
}
