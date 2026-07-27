import type { BusinessRole } from "@/generated/prisma/client";

export type BusinessPermission = "branch:update" | "booking:read" | "booking:update";

const permissions: Record<BusinessRole, readonly BusinessPermission[]> = {
  OWNER: ["branch:update", "booking:read", "booking:update"],
  ADMIN: ["branch:update", "booking:read", "booking:update"],
  STAFF: ["booking:read", "booking:update"],
};

export function can(role: BusinessRole, permission: BusinessPermission): boolean {
  return permissions[role].includes(permission);
}
