import { prisma } from "@/core/database/prisma";
import { errorText, logger } from "@/core/observability/logger";

/**
 * Publishes the service onboarding created, once the business can actually honour a booking made
 * against it — a specialist working it and a branch with opening hours, the same two conditions
 * `service-service` refuses a manual publish without. Registration seeds both, so the ordinary salon
 * clears them while still on step 1; this exists for the one that emptied its schedule or archived its
 * staff first and would otherwise be left holding a service it never asked to keep hidden.
 *
 * Deliberately narrow. It only touches a business whose entire catalogue is that one service and which
 * has never managed services itself. Every settings action on a service records an audit event under
 * the `service.` prefix, and the prefix is what is matched rather than a list of the ones that came to
 * mind: archiving a service unpublishes it and restoring it leaves a draft, so a business that took its
 * only service offline through the archive and later saved an unrelated schedule used to have it
 * published again underneath them. Once the owner has touched a service at all, whether it is public is
 * their decision and not ours to reverse.
 */
export async function publishFirstServiceWhenReady(businessId: string) {
  // Both callers run this after their own transaction has committed, so a failure here must not become
  // the answer the owner sees: their schedule or their specialist is saved either way, and reporting a
  // refusal would send them to save it a second time. The service just stays hidden until the next save.
  try {
    await publishWhenReady(businessId);
  } catch (error) {
    logger.warn("onboarding.first_service_publish_failed", { businessId, error: errorText(error) });
  }
}

async function publishWhenReady(businessId: string) {
  const services = await prisma.service.findMany({
    where: { branch: { businessId }, archivedAt: null },
    select: { id: true, branchId: true, isPublished: true },
    take: 2,
  });
  const [service] = services;
  if (services.length !== 1 || !service || service.isPublished) return;

  const [managedInSettings, staffCount, scheduleCount] = await Promise.all([
    prisma.auditEvent.count({ where: { businessId, type: { startsWith: "service." } } }),
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

  // Conditional so two saves landing together publish once. It does not defend against an unpublish
  // committed between the read above and this write — that one would be undone — but reaching it means
  // the owner opened the service screen, which writes an audit event and takes this whole path away
  // from the next save.
  await prisma.service.updateMany({ where: { id: service.id, isPublished: false }, data: { isPublished: true } });
}
