import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BranchForm } from "@/features/dashboard/branch-form";

describe("BranchForm", () => {
  const action = async () => undefined;

  it("renders complete create fields and outcome-named action", () => {
    const html = renderToStaticMarkup(<BranchForm action={action} />);
    expect(html).toContain("Создать филиал");
    expect(html).toContain("Название филиала");
    expect(html).toContain("Адрес");
    expect(html).toContain("Контактный телефон");
    expect(html).toContain("Часовой пояс");
  });

  it("renders edit values and an inline error", () => {
    const html = renderToStaticMarkup(<BranchForm action={action} branch={{ id: "branch-1", name: "Центр", address: "Рудаки, 42", phone: "+992900001122", timeZone: "Asia/Dushanbe" }} error="Проверьте номер телефона." />);
    expect(html).toContain('value="Центр"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Сохранить филиал");
  });
});
