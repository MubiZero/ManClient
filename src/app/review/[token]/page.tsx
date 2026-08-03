import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { verifyCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { ReviewError, submitReview } from "@/core/reviews/review-service";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";
import { ReviewForm } from "@/features/public-booking/review-form";
import { EmptyState } from "@/features/ui-kit/empty-state";
import { ToastEmitter } from "@/features/ui-kit/toast-emitter";

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  const booking = await getBooking(token);
  if (!booking) notFound();

  const existingReview = await prisma.review.findUnique({ where: { bookingId: booking.id }, select: { id: true } });

  const brandStyle = booking.business.brandColor
    ? ({ "--color-primary": booking.business.brandColor, "--color-ring": booking.business.brandColor } as CSSProperties)
    : undefined;

  async function submit(formData: FormData) {
    "use server";
    let action: { bookingId: string };
    try {
      action = verifyCustomerBookingToken(token, "review_booking");
    } catch {
      redirect(`/review/${token}?error=expired`);
    }
    const targetBooking = await prisma.booking.findUnique({ where: { id: action.bookingId }, select: { customerId: true } });
    if (!targetBooking) redirect(`/review/${token}?error=not_found`);
    const rating = Number(formData.get("rating"));
    const comment = String(formData.get("comment") ?? "");
    try {
      await submitReview({ bookingId: action.bookingId, customerId: targetBooking.customerId, rating, comment });
    } catch (caught) {
      const code = caught instanceof ReviewError ? caught.code : "INVALID_INPUT";
      redirect(`/review/${token}?error=${code}`);
    }
    redirect(`/review/${token}`);
  }

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <ToastEmitter error={errorMessage(error)} />
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <PublicBrandMark slug={booking.business.slug} name={booking.business.name} hasLogo={Boolean(booking.business.logoStorageKey)} />
          <span className="text-sm font-medium text-muted-foreground">Отзыв о визите</span>
        </div>
      </header>
      <section className="mx-auto max-w-md px-4 pb-4 pt-8">
        <p className="text-sm font-medium text-primary">{booking.business.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          {existingReview ? "Спасибо за отзыв" : "Как вам визит?"}
        </h1>
        {!existingReview ? (
          <p className="mt-2 text-muted-foreground">
            {booking.service.name}, специалист {booking.staff.displayName}. Ваша оценка поможет другим клиентам.
          </p>
        ) : null}
      </section>
      <div className="mx-auto max-w-md px-4 pb-16">
        {existingReview ? (
          <EmptyState title="Отзыв уже отправлен" description="Вы уже оставили отзыв об этом визите. Спасибо, что нашли время!" />
        ) : (
          <ReviewForm submitAction={submit} />
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

function errorMessage(code?: string): string | undefined {
  return ({
    expired: "Ссылка недействительна или устарела.",
    not_found: "Запись не найдена.",
    INVALID_INPUT: "Укажите оценку от 1 до 5.",
    ALREADY_SUBMITTED: "Вы уже оставили отзыв об этой записи.",
    NOT_FOUND: "Запись не найдена.",
  } as Record<string, string>)[code ?? ""];
}
