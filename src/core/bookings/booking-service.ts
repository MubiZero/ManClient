import { z } from "zod";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { reserveAllocation } from "@/core/bookings/booking-allocation";
import { prisma } from "@/core/database/prisma";
import { scheduleBusinessNotificationSafely } from "@/core/notifications/business-notification-service";

const RESERVATION_MINUTES = 15;

const createBookingSchema = z.object({
  businessSlug: z.string().min(1),
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  resourceIds: z.array(z.string().min(1)),
  startsAt: z.date(),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(/^\+992\d{9}$/),
  }),
  source: z.enum(["WEB", "TELEGRAM"]).default("WEB"),
  promoCode: z.string().trim().min(1).max(32).optional(),
});

export type CreateBookingInput = z.input<typeof createBookingSchema>;

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

export async function createPendingBooking(input: CreateBookingInput, now = new Date()) {
  const validatedInput = createBookingSchema.parse(input);
  const configuration = await prisma.business.findUnique({
    where: { slug: validatedInput.businessSlug },
    select: {
      id: true,
      status: true,
      branches: {
        where: { id: validatedInput.branchId },
        select: {
          id: true,
          services: {
            where: { id: validatedInput.serviceId, archivedAt: null, isPublished: true },
            select: {
              id: true,
              amountDiram: true,
              durationMinutes: true,
              staffMembers: { where: { id: validatedInput.staffId }, select: { id: true } },
              resources: { select: { resourceId: true } },
            },
          },
        },
      },
    },
  });

  const service = configuration?.branches[0]?.services[0];
  if (!configuration || !service || service.staffMembers.length !== 1) {
    throw new BookingValidationError("Service, branch, or staff assignment is invalid");
  }
  if (configuration.status === "SUSPENDED") {
    throw new BookingValidationError("Business is suspended");
  }

  const requiredResourceIds = service.resources.map(({ resourceId }) => resourceId).sort();
  const selectedResourceIds = [...new Set(validatedInput.resourceIds)].sort();
  if (requiredResourceIds.join(":") !== selectedResourceIds.join(":")) {
    throw new BookingValidationError("Selected resources do not satisfy the service");
  }

  const availableStarts = await getAvailableStarts({
    branchId: validatedInput.branchId,
    serviceId: validatedInput.serviceId,
    staffId: validatedInput.staffId,
    resourceIds: selectedResourceIds,
    rangeStartsAt: validatedInput.startsAt,
    rangeEndsAt: new Date(validatedInput.startsAt.getTime() + service.durationMinutes * 60_000),
    durationMinutes: service.durationMinutes,
    intervalMinutes: service.durationMinutes,
  });
  if (availableStarts.length !== 1) {
    throw new BookingValidationError("Selected slot is outside working hours or unavailable");
  }

  const customer = await prisma.customer.upsert({
    where: {
      businessId_phone: { businessId: configuration.id, phone: validatedInput.customer.phone },
    },
    create: { businessId: configuration.id, ...validatedInput.customer },
    update: { name: validatedInput.customer.name },
  });
  const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
  const booking = await reserveAllocation({
    branchId: validatedInput.branchId,
    serviceId: service.id,
    staffId: validatedInput.staffId,
    customerId: customer.id,
    resourceIds: selectedResourceIds,
    startsAt: validatedInput.startsAt,
    durationMinutes: service.durationMinutes,
    expiresAt,
    createdAt: now,
    amountDiram: service.amountDiram,
    promoCode: validatedInput.promoCode,
    source: validatedInput.source,
    actor: { type: "customer", id: customer.id },
  });

  if (!booking.payment) {
    throw new Error("Payment was not created with booking");
  }

  await scheduleBusinessNotificationSafely({
    businessId: configuration.id,
    bookingId: booking.id,
    kind: "NEW_BOOKING",
    deduplicationKey: `booking:${booking.id}:created`,
    scheduledAt: now,
  });

  return { bookingId: booking.id, paymentId: booking.payment.id, expiresAt };
}
