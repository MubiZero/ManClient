import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { listBusinessOptions, listBusinesses, loadBusinessDetail, setBusinessStatus } from "@/core/platform/business-directory";
import { listAuditEvents, listAuditEventTypes } from "@/core/platform/audit-log";

describe("platform business directory", () => {
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("finds a business by a case-insensitive name or slug match", async () => {
    const suffix = randomUUID();
    const business = await createBusiness(`Salon Rohat ${suffix}`, `salon-rohat-${suffix}`);

    const byName = await listBusinesses(`rohat ${suffix}`.toUpperCase());
    expect(byName.items.map((item) => item.id)).toContain(business.id);

    const bySlug = await listBusinesses(`salon-rohat-${suffix}`);
    expect(bySlug.items.map((item) => item.id)).toContain(business.id);
  });

  it("paginates with a cursor and reports no next page once exhausted", async () => {
    const marker = randomUUID();
    await createBusiness(`Cursor Business ${marker}`);

    const { items, nextCursor } = await listBusinesses(marker);
    expect(items.length).toBe(1);
    expect(nextCursor).toBeNull();
  });

  it("lists lightweight business options for dropdown filters", async () => {
    const business = await createBusiness(`Dropdown Business ${randomUUID()}`);

    const options = await listBusinessOptions();
    expect(options).toContainEqual({ id: business.id, name: business.name });
  });

  it("suspends and reactivates a business, recording an audit event each time", async () => {
    const business = await createBusiness(`Suspend Business ${randomUUID()}`);
    const adminUserId = randomUUID();

    await setBusinessStatus({ businessId: business.id, status: "SUSPENDED", actorUserId: adminUserId });
    let detail = await loadBusinessDetail(business.id);
    expect(detail?.business.status).toBe("SUSPENDED");

    await setBusinessStatus({ businessId: business.id, status: "ACTIVE", actorUserId: adminUserId });
    detail = await loadBusinessDetail(business.id);
    expect(detail?.business.status).toBe("ACTIVE");

    const { items: events } = await listAuditEvents({ businessId: business.id });
    expect(events.map((event) => event.type)).toEqual(["business.reactivated", "business.suspended"]);
    expect(events.every((event) => event.actorType === "platform_admin")).toBe(true);
  });

  it("filters audit events by type and reports available types", async () => {
    const business = await createBusiness(`Audit Business ${randomUUID()}`);
    await setBusinessStatus({ businessId: business.id, status: "SUSPENDED", actorUserId: randomUUID() });

    const types = await listAuditEventTypes();
    expect(types).toContain("business.suspended");

    const { items } = await listAuditEvents({ businessId: business.id, type: "business.suspended" });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("business.suspended");
  });

  it("returns null for an unknown business id", async () => {
    await expect(loadBusinessDetail("missing-business")).resolves.toBeNull();
  });

  async function createBusiness(name: string, slug?: string) {
    const business = await prisma.business.create({
      data: { name, slug: slug ?? `business-${randomUUID()}` },
    });
    businessIds.push(business.id);
    return business;
  }
});
