import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { brandPalette } from "@/core/branding/brand-palette";
import type { CSSProperties } from "react";

import { verifyCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { RescheduleForm } from "@/features/public-booking/reschedule-form";
import { LocaleSwitcher } from "@/features/public-booking/locale-switcher";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import { resolveLocale, t } from "@/i18n/translate";

const LOCALE_COOKIE = "nc-locale";

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };

export default async function ReschedulePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { lang } = await searchParams;
  const booking = await getBooking(token);
  if (!booking) notFound();

  const cookieStore = await cookies();
  const locale = resolveLocale([lang, cookieStore.get(LOCALE_COOKIE)?.value, booking.business.publicPageLocale]);

  const brandStyle = booking.business.brandColor
    ? (brandPalette(booking.business.brandColor) as CSSProperties | null) ?? undefined
    : undefined;

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <PublicBrandMark slug={booking.business.slug} name={booking.business.name} hasLogo={Boolean(booking.business.logoStorageKey)} />
          <span className="text-sm font-medium text-muted-foreground">{t(locale, "reschedule.headerLabel")}</span>
          <LocaleSwitcher locale={locale} />
        </div>
      </header>
      <section className="mx-auto max-w-md px-4 pb-4 pt-8">
        <p className="text-sm font-medium text-primary">{booking.business.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{t(locale, "reschedule.title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t(locale, "reschedule.subtitle", { service: booking.service.name, staff: booking.staff.displayName })}
        </p>
      </section>
      <div className="mx-auto max-w-md px-4 pb-16">
        <RescheduleForm
          token={token}
          branchId={booking.branchId}
          serviceId={booking.serviceId}
          staffId={booking.staffId}
          timeZone={booking.branch.timeZone}
          locale={locale}
        />
      </div>
    </main>
  );
}

async function getBooking(token: string) {
  try {
    const action = verifyCustomerBookingToken(token, "reschedule_booking");
    return await prisma.booking.findFirst({
      where: { id: action.bookingId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
      include: { business: true, branch: true, service: true, staff: true },
    });
  } catch {
    return null;
  }
}
