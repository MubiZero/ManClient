import { notFound } from "next/navigation";

import { verifyCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { RescheduleForm } from "@/features/public-booking/reschedule-form";

export default async function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBooking(token);
  if (!booking) notFound();

  return (
    <main className="booking-page">
      <header className="public-header">
        <span className="brand">MC</span>
        <span>Перенос записи</span>
      </header>
      <section className="booking-hero">
        <p className="context-label">{booking.business.name}</p>
        <h1>Выберите новое время</h1>
        <p>
          {booking.service.name}, специалист {booking.staff.displayName}. Старая запись сохранится,
          пока новое время не будет подтверждено.
        </p>
      </section>
      <RescheduleForm
        token={token}
        branchId={booking.branchId}
        serviceId={booking.serviceId}
        staffId={booking.staffId}
      />
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
