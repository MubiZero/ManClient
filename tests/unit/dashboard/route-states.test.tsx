import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import DashboardError from "@/app/(dashboard)/dashboard/error";
import DashboardLoading from "@/app/(dashboard)/dashboard/loading";
import SettingsLoading from "@/app/(dashboard)/dashboard/settings/loading";

describe("dashboard route states", () => {
  it("announces dashboard and settings loading states", () => {
    expect(renderToStaticMarkup(<DashboardLoading />)).toContain("Загружаем кабинет");
    expect(renderToStaticMarkup(<SettingsLoading />)).toContain("Загружаем настройки");
  });

  it("offers a safe retry and overview recovery", () => {
    const html = renderToStaticMarkup(<DashboardError error={new Error("private detail")} reset={vi.fn()} />);
    expect(html).toContain("Повторить загрузку");
    expect(html).toContain("Вернуться в обзор");
    expect(html).not.toContain("private detail");
  });
});
