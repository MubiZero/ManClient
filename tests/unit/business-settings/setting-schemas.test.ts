import { describe, expect, it } from "vitest";

import {
  branchInputSchema,
  resourceInputSchema,
  serviceInputSchema,
  staffInputSchema,
  weeklyScheduleSchema,
} from "@/core/business-settings/setting-schemas";

describe("business settings schemas", () => {
  it("normalizes a complete service input", () => {
    const result = serviceInputSchema.parse({
      name: "  Мужская стрижка  ",
      description: "  Стрижка и укладка  ",
      durationMinutes: "45",
      amountSomoni: "50,25",
      branchId: "branch-1",
      staffIds: ["staff-1", "staff-1"],
      resourceIds: [],
      isPublished: true,
    });

    expect(result).toMatchObject({
      name: "Мужская стрижка",
      description: "Стрижка и укладка",
      durationMinutes: 45,
      staffIds: ["staff-1"],
    });
  });

  it("accepts complete branch, staff and resource inputs", () => {
    expect(branchInputSchema.safeParse({ name: "Центр", address: "Рудаки, 42", phone: "+992 90 000 11 22", timeZone: "Asia/Dushanbe" }).success).toBe(true);
    expect(staffInputSchema.safeParse({ displayName: "Манижа", phone: "", branchIds: ["branch-1", "branch-2"], primaryBranchId: "branch-1", serviceIds: [] }).success).toBe(true);
    expect(resourceInputSchema.safeParse({ name: "Подъёмник 1", branchId: "branch-1", kind: "LIFT", capacity: "1", isAvailable: true, serviceIds: [] }).success).toBe(true);
  });

  it("rejects a primary branch outside the staff assignments", () => {
    expect(staffInputSchema.safeParse({ displayName: "Манижа", phone: "", branchIds: ["branch-1"], primaryBranchId: "branch-2", serviceIds: [] }).success).toBe(false);
  });

  it("rejects overlapping weekly intervals and breaks outside working hours", () => {
    expect(weeklyScheduleSchema.safeParse({
      rules: [
        { dayOfWeek: 1, startsAt: "09:00", endsAt: "13:00" },
        { dayOfWeek: 1, startsAt: "12:00", endsAt: "18:00" },
      ],
      breaks: [],
    }).success).toBe(false);

    expect(weeklyScheduleSchema.safeParse({
      rules: [{ dayOfWeek: 1, startsAt: "09:00", endsAt: "18:00" }],
      breaks: [{ dayOfWeek: 1, startsAt: "08:00", endsAt: "09:00" }],
    }).success).toBe(false);
  });
});
