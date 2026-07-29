import { describe, expect, it } from "vitest";

import { dashboardNavigationForRole, isDashboardRouteActive } from "@/features/dashboard/dashboard-nav";

describe("dashboard navigation", () => {
  it("gives owners all settings and a mobile menu", () => {
    const navigation = dashboardNavigationForRole("OWNER");
    expect(navigation.map(item => item.label)).toEqual(expect.arrayContaining(["Обзор", "Записи", "Филиалы", "Услуги", "Команда", "Ресурсы", "Расписание", "Интеграции"]));
    expect(navigation.filter(item => item.mobile === "primary").map(item => item.label)).toEqual(["Обзор", "Записи"]);
  });

  it("does not expose administrative routes to staff", () => {
    expect(dashboardNavigationForRole("STAFF").map(item => item.label)).toEqual(["Обзор", "Записи"]);
  });

  it("marks exact and nested routes active without activating overview everywhere", () => {
    expect(isDashboardRouteActive("/dashboard", "/dashboard/bookings")).toBe(false);
    expect(isDashboardRouteActive("/dashboard/settings/services", "/dashboard/settings/services/new")).toBe(true);
    expect(isDashboardRouteActive("/dashboard/bookings", "/dashboard/bookings")).toBe(true);
  });
});
