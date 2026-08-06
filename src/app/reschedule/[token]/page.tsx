import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { verifyCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { RescheduleForm } from "@/features/public-booking/reschedule-form";
import { PublicBrandMark } from "@/features/public-booking/public-brand-mark";

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBooking(token);
  if (!booking) notFound();

  const brandStyle = booking.business.brandColor
    ? ({ "--color-primary": booking.business.brandColor, "--color-ring": booking.business.brandColor } as CSSProperties)
    : undefined;

  return (
    <main className="min-h-screen bg-secondary/30" style={brandStyle}>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
          <PublicBrandMark slug={booking.business.slug} name={booking.business.name} hasLogo={Boolean(booking.business.logoStorageKey)} />
          <span className="text-sm font-medium text-muted-foreground">Перенос записи</span>
        </div>
      </header>
      <section className="mx-auto max-w-md px-4 pb-4 pt-8">
        <p className="text-sm font-medium text-primary">{booking.business.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Выберите новое время</h1>
        <p className="mt-2 text-muted-foreground">
          {booking.service.name}, специалист {booking.staff.displayName}. Старая запись сохранится,
          пока новое время не будет подтверждено.
        </p>
      </section>
      <div className="mx-auto max-w-md px-4 pb-16">
        <RescheduleForm
          token={token}
          branchId={booking.branchId}
          serviceId={booking.serviceId}
          staffId={booking.staffId}
          timeZone={booking.branch.timeZone}
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
