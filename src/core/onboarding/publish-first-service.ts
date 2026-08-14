import { prisma } from "@/core/database/prisma";

/**
 * Publishes the service onboarding created, once the business can actually honour a booking made
 * against it — a specialist working it and a branch with opening hours, the same two conditions
 * `service-service` refuses a manual publish without. Registration seeds both, so the ordinary salon
 * clears them while still on step 1; this exists for the one that emptied its schedule or archived its
 * staff first and would otherwise be left holding a service it never asked to keep hidden.
 *
 * Deliberately narrow. It only touches a business whose entire catalogue is that one service and which
 * has never managed services itself — the settings screen writes a `service.created` or
 * `service.updated` event on every save, so the moment the owner takes something offline on purpose,
 * publication is their decision and not ours to reverse.
 */
export async function publishFirstServiceWhenReady(businessId: string) {
  const services = await prisma.service.findMany({
    where: { branch: { businessId }, archivedAt: null },
    select: { id: true, branchId: true, isPublished: true },
    take: 2,
  });
  const [service] = services;
  if (services.length !== 1 || !service || service.isPublished) return;

  const [managedInSettings, staffCount, scheduleCount] = await Promise.all([
    prisma.auditEvent.count({ where: { businessId, type: { in: ["service.created", "service.updated"] } } }),
    prisma.staffMember.count({
      where: {
        archivedAt: null,
        services: { some: { id: service.id } },
        branches: { some: { branchId: service.branchId } },
      },
    }),
    prisma.businessScheduleRule.count({ where: { branchId: service.branchId } }),
  ]);
  if (managedInSettings > 0 || staffCount === 0 || scheduleCount === 0) return;

  // Conditional on the state that was read, so two saves landing together publish once, and a manual
  // unpublish that slipped in between is left alone rather than silently undone.
  await prisma.service.updateMany({ where: { id: service.id, isPublished: false }, data: { isPublished: true } });
}
