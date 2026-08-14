import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { brandPalette } from "@/core/branding/brand-palette";
import type { CSSProperties } from "react";

import { verifyCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { ReviewError, submitReview } from "@/core/reviews/review-service";
import { LocaleSwitcher } from "@/features/public-booking/locale-switcher";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import { ReviewForm } from "@/features/public-booking/review-form";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";
import type { SupportedLocale, TranslationKey } from "@/i18n/translate";
import { resolveLocale, t } from "@/i18n/translate";

const LOCALE_COOKIE = "nc-locale";

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; lang?: string }> };

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { error, lang } = await searchParams;
  const booking = await getBooking(token);
  if (!booking) notFound();

  const cookieStore = await cookies();
  const locale = resolveLocale([lang, cookieStore.get(LOCALE_COOKIE)?.value, booking.business.publicPageLocale]);

  const existingReview = await prisma.review.findUnique({ where: { bookingId: booking.id }, select: { id: true } });

  const brandStyle = booking.business.brandColor
    ? (brandPalette(booking.business.brandColor) as CSSProperties | null) ?? undefined
    : undefined;

  async function submit(formData: FormData) {
    "use server";
    // Every hop back into this page carries the language the customer is reading it in: the review
    // link arrives by SMS, so the query string is the only place that knowledge lives.
    const back = (query: string) => `/review/${token}?lang=${locale}${query}`;
    let action: { bookingId: string };
    try {
      action = verifyCustomerBookingToken(token, "review_booking");
    } catch {
      redirect(back("&error=expired"));
    }
    const targetBooking = await prisma.booking.findUnique({ where: { id: action.bookingId }, select: { customerId: true } });
    if (!targetBooking) redirect(back("&error=not_found"));
    const rating = Number(formData.get("rating"));
    const comment = String(formData.get("comment") ?? "");
    try {
      await submitReview({ bookingId: action.bookingId, customerId: targetBooking.customerId, rating, comment });
    } catch (caught) {
      const code = caught instanceof ReviewError ? caught.code : "INVALID_INPUT";
      redirect(back(`&error=${code}`));
    }
    redirect(back(""));
  }

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <ToastEmitter error={errorMessage(locale, error)} />
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <PublicBrandMark slug={booking.business.slug} name={booking.business.name} hasLogo={Boolean(booking.business.logoStorageKey)} />
          <span className="text-sm font-medium text-muted-foreground">{t(locale, "review.headerLabel")}</span>
          <LocaleSwitcher locale={locale} />
        </div>
      </header>
      <section className="mx-auto max-w-md px-4 pb-4 pt-8">
        <p className="text-sm font-medium text-primary">{booking.business.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          {t(locale, existingReview ? "review.thanksTitle" : "review.title")}
        </h1>
        {!existingReview ? (
          <p className="mt-2 text-muted-foreground">
            {t(locale, "review.subtitle", { service: booking.service.name, staff: booking.staff.displayName })}
          </p>
        ) : null}
      </section>
      <div className="mx-auto max-w-md px-4 pb-16">
        {existingReview ? (
          <EmptyState title={t(locale, "review.alreadyTitle")} description={t(locale, "review.alreadyDescription")} />
        ) : (
          <ReviewForm submitAction={submit} locale={locale} />
        )}
      </div>
    </main>
  );
}

async function getBooking(token: string) {
  try {
    const action = verifyCustomerBookingToken(token, "review_booking");
    return await prisma.booking.findFirst({
      where: { id: action.bookingId, status: "CONFIRMED" },
      include: { business: true, service: true, staff: true },
    });
  } catch {
    return null;
  }
}

function errorMessage(locale: SupportedLocale, code?: string): string | undefined {
  const key = ({
    expired: "review.errors.expired",
    not_found: "review.errors.notFound",
    INVALID_INPUT: "review.errors.invalidInput",
    ALREADY_SUBMITTED: "review.errors.alreadySubmitted",
    NOT_FOUND: "review.errors.notFound",
    PLAN_REQUIRED: "review.errors.planRequired",
  } as Record<string, TranslationKey>)[code ?? ""];
  return key ? t(locale, key) : undefined;
}
