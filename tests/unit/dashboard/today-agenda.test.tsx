import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TodayAgenda } from "@/features/dashboard/bookings/today-agenda";

it("renders a useful empty agenda action", () => { const html = renderToStaticMarkup(<TodayAgenda items={[]} />); expect(html).toContain("На сегодня активных записей нет"); expect(html).toContain("Создать запись"); });
