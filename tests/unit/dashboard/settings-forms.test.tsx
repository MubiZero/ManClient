import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResourceForm } from "@/features/dashboard/resource-form";
import { ServiceForm } from "@/features/dashboard/service-form";
import { StaffForm } from "@/features/dashboard/staff-form";
import { TelegramIntegrationForm } from "@/features/dashboard/telegram-integration-form";

const action = async () => undefined;
const branches = [{ id: "branch-1", name: "Центр" }, { id: "branch-2", name: "Сино" }];
const staff = [{ id: "staff-1", displayName: "Манижа", branchNames: ["Центр"] }];
const services = [{ id: "service-1", name: "Стрижка", branchId: "branch-1" }];
const resources = [{ id: "resource-1", name: "Кресло 1", branchId: "branch-1" }];

describe("business settings forms", () => {
  it("renders complete service controls", () => {
    const html = renderToStaticMarkup(<ServiceForm action={action} branches={branches} staff={staff} resources={resources} />);
    expect(html).toContain("Создать услугу");
    expect(html).toContain("Стоимость, сомони");
    expect(html).toContain("Специалисты");
    expect(html).toContain("Ресурсы");
    expect(html).toContain("Опубликовать для клиентов");
  });

  it("separates specialist profile from dashboard access", () => {
    const html = renderToStaticMarkup(<StaffForm action={action} branches={branches} services={services} />);
    expect(html).toContain("Создать специалиста");
    expect(html).toContain("Основной филиал");
    expect(html).toContain("Доступ в кабинет создаётся отдельно");
  });

  it("renders resource availability and capacity", () => {
    const html = renderToStaticMarkup(<ResourceForm action={action} branches={branches} services={services} />);
    expect(html).toContain("Создать ресурс");
    expect(html).toContain("Тип ресурса");
    expect(html).toContain("Вместимость");
    expect(html).toContain("Доступен для записи");
  });

  it("makes one managed customer bot the primary Telegram setup", () => {
    const html = renderToStaticMarkup(<TelegramIntegrationForm initialStatus={{
      status: "DISCONNECTED",
      botUsername: null,
      connectedAt: null,
      lastWebhookError: null,
    }} />);

    expect(html).toContain("Создайте только одного бота");
    expect(html).toContain("Создать клиентского бота");
    expect(html).toContain("Подключить существующего бота");
    expect(html).toContain("@manclient_bot");
    expect(html).not.toContain("Токен клиентского бота");
  });
});
