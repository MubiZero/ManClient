import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { Star } from "lucide-react";

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
      publicPageLocale: true,
      subscriptionPlan: true,
      branches: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          timeZone: true,
          services: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              durationMinutes: true,
              amountDiram: true,
              staffMembers: { orderBy: { displayName: "asc" }, select: { id: true, displayName: true } },
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
    ? ({ "--color-primary": business.brandColor, "--color-ring": business.brandColor } as CSSProperties)
    : undefined;

  const rating = businessHasFeature(business.subscriptionPlan, "REVIEWS")
    ? await getAverageRating(business.id)
    : { average: null, count: 0 };

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <PublicBrandMark slug={business.slug} name={business.name} hasLogo={Boolean(business.logoStorageKey)} href="/" />
          <span className="text-sm font-medium text-muted-foreground">{t(locale, "booking.onlineBookingLabel")}</span>
          <nav className="ml-auto flex items-center gap-1 text-xs font-medium" aria-label={t(locale, "booking.languageSwitcherLabel")}>
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
        ) : business.branches.length === 0 || business.branches.every(({ services }) => services.length === 0) ? (
          <EmptyState
            title={t(locale, "booking.comingSoonTitle")}
            description={t(locale, "booking.comingSoonDescription")}
          />
        ) : (
          <>
            <BookingForm
              businessSlug={business.slug}
              branches={business.branches}
              locale={locale}
              canRepeat={businessHasFeature(business.subscriptionPlan, "RECURRING_BOOKINGS")}
              canUsePromoCodes={businessHasFeature(business.subscriptionPlan, "PROMO_CODES")}
              canUseWaitlist={businessHasFeature(business.subscriptionPlan, "WAITLIST")}
            />
            <PolicyNotice
              locale={locale}
              policy={{
                minLeadTimeMinutes: business.minLeadTimeMinutes,
                maxAdvanceDays: business.maxAdvanceDays,
                freeCancellationHours: business.freeCancellationHours,
                maxCustomerReschedules: business.maxCustomerReschedules,
                cancellationPolicy: business.cancellationPolicy,
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
