import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScheduleEditor } from "@/features/dashboard/schedule-editor";
import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";

const action = async () => undefined;

describe("schedule editor", () => {
  it("renders every weekday and branch working controls", () => {
    const html = renderToStaticMarkup(<ScheduleEditor mode="branch" rules={[]} breaks={[]} action={action} />);
    expect(html).toContain("Понедельник");
    expect(html).toContain("Воскресенье");
    expect(html).toContain("Перерыв");
    expect(html).toContain("Скопировать на будни");
  });

  it("explains inherited staff hours and offers restoration", () => {
    const html = renderToStaticMarkup(<ScheduleEditor mode="staff" inherited rules={[]} breaks={[]} action={action} restoreAction={action} />);
    expect(html).toContain("Используется график филиала");
    expect(html).toContain("Вернуть график филиала");
  });

  it("keeps an incomplete Telegram channel separate from launch readiness", () => {
    const html = renderToStaticMarkup(<OnboardingChecklist businessSlug="salon" readiness={{ service: true, staff: true, schedule: true, payment: true, telegram: false }} />);
    expect(html).toContain("Страница записи работает");
    expect(html).toContain("Добавьте запись через Telegram");
    expect(html).not.toContain("Проверка готовности");
  });
});
